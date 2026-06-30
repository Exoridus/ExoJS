export const beatDetectorWorkletSource = `
// ---- Hann window + FFT (radix-2 Cooley-Tukey) ----
function applyHannWindow(real, imag) {
    var n = real.length;
    for (var i = 0; i < n; i++) {
        var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        real[i] *= w;
        imag[i] = 0;
    }
}

function bitReversePermute(real, imag) {
    var n = real.length;
    var j = 0;
    for (var i = 1; i < n; i++) {
        var bit = n >> 1;
        for (; j & bit; bit >>= 1) { j ^= bit; }
        j ^= bit;
        if (i < j) {
            var t = real[i]; real[i] = real[j]; real[j] = t;
            t = imag[i]; imag[i] = imag[j]; imag[j] = t;
        }
    }
}

function fftInPlace(real, imag) {
    applyHannWindow(real, imag);
    bitReversePermute(real, imag);
    var n = real.length;
    for (var len = 2; len <= n; len <<= 1) {
        var halfLen = len >> 1;
        var step = -2 * Math.PI / len;
        for (var i = 0; i < n; i += len) {
            for (var k = 0; k < halfLen; k++) {
                var angle = step * k;
                var cos = Math.cos(angle);
                var sin = Math.sin(angle);
                var re = real[i+k+halfLen]*cos - imag[i+k+halfLen]*sin;
                var im = real[i+k+halfLen]*sin + imag[i+k+halfLen]*cos;
                real[i+k+halfLen] = real[i+k] - re;
                imag[i+k+halfLen] = imag[i+k] - im;
                real[i+k] += re;
                imag[i+k] += im;
            }
        }
    }
}

// ---- Mel filterbank ----
function buildMelFilterbank(numBands, fMin, fMax, fftSize, sampleRate) {
    var numBins = fftSize >> 1;
    var nyquist = sampleRate / 2;
    var melMin = 2595 * Math.log10(1 + fMin / 700);
    var melMax = 2595 * Math.log10(1 + fMax / 700);
    var melPoints = new Float32Array(numBands + 2);
    for (var i = 0; i < numBands + 2; i++) {
        melPoints[i] = melMin + (melMax - melMin) * i / (numBands + 1);
    }
    var binPoints = new Float32Array(numBands + 2);
    for (var i = 0; i < numBands + 2; i++) {
        var hz = 700 * (Math.pow(10, melPoints[i] / 2595) - 1);
        binPoints[i] = Math.round(hz / nyquist * (numBins - 1));
    }
    var bands = [];
    for (var b = 0; b < numBands; b++) {
        var startBin = Math.max(0, Math.min(numBins - 1, binPoints[b]));
        var peakBin  = Math.max(0, Math.min(numBins - 1, binPoints[b+1]));
        var endBin   = Math.max(0, Math.min(numBins - 1, binPoints[b+2]));
        var len = endBin - startBin + 1;
        var weights = new Float32Array(len);
        for (var i = 0; i < len; i++) {
            var bin = startBin + i;
            if (bin <= peakBin && peakBin > startBin) {
                weights[i] = (bin - startBin) / (peakBin - startBin);
            } else if (bin > peakBin && endBin > peakBin) {
                weights[i] = (endBin - bin) / (endBin - peakBin);
            } else {
                weights[i] = 1;
            }
        }
        bands.push({ startBin: startBin, peakBin: peakBin, endBin: endBin, weights: weights });
    }
    return bands;
}

function computeMelBands(mag, bands, out) {
    for (var b = 0; b < bands.length; b++) {
        var band = bands[b];
        var energy = 0;
        for (var i = 0; i < band.weights.length; i++) {
            energy += mag[band.startBin + i] * band.weights[i];
        }
        out[b] = Math.log(1 + energy);
    }
}

// ---- Tempogram (single source of truth — transliterated from src/dsp/tempogram.ts) ----
// Guarded by test/dsp/worklet-parity.test.ts: these MUST stay numerically identical to
// computeAcf / scoreTempoHypotheses / computeTempoCandidates in src/dsp/tempogram.ts.
var TEMPO_PRIOR_MU = 140;
var TEMPO_PRIOR_SIGMA = Math.log(2) * 0.9;
var COMB_W_FUNDAMENTAL = 1.0;
var COMB_W_HALF = 0.5;
var COMB_W_THIRD = 0.3;
var COMB_PENALTY_DOUBLE = 1.0;
var COMB_PENALTY_TRIPLE = 0.5;

// ---- Onset peak-picker (T3): adaptive normalization + noise gate + refractory ----
// The raw spectral flux is normalised against a running median/MAD baseline so that
// soft onsets (low, broad novelty) and hard transients become comparable, then a
// rising-edge picker (upward crossing of an adaptive threshold) with a noise-floor gate
// and an IBI-derived refractory turns the novelty curve into a clean onset stream. This
// stream (per-hop strength + sub-hop onset positions) is what the T4 PLL anchors to.
var ONSET_NORM_WINDOW_SEC = 1.5; // running median/MAD window for novelty normalization
var ONSET_MAD_SCALE = 1.4826; // MAD → σ consistency factor (Gaussian)
var ONSET_THRESHOLD = 3.0; // normalized-novelty peak threshold (robust z-score)
var ONSET_NOISE_FLOOR_FRAC = 0.1; // a peak must clear this fraction of the running flux peak
var ONSET_ABS_FLOOR = 1e-4; // absolute novelty floor — kills divide-by-noise in silence
var ONSET_PEAK_DECAY = 0.999; // per-hop decay of the running flux peak (noise-floor reference)
var ONSET_MIN_REFRACTORY_SEC = 0.1; // minimum spacing between detected onsets (~100 ms)
var ONSET_REFRACTORY_IBI_FRAC = 0.4; // once locked, refractory = max(min, frac × IBI)
var ONSET_BEAT_COAST_IBI = 2.0; // suppress beat emission after this many IBIs without an onset
var ONSET_RING_SIZE = 16; // recent onsets retained for T4's PLL nearestOnset()

// ---- PLL beat-phase tracker (T4) ----
// A bounded phase-locked loop replaces the old constant-IBI predictor + buggy snap. Each
// predicted beat is corrected toward the nearest detected onset (sub-hop precise, from the
// T3 onset ring): a proportional phase nudge plus a small period adjustment, BOTH clamped so
// a single noisy onset can never yank the grid. Exactly one beat is emitted per predicted
// beat (the old snap double-advanced and timestamped a beat an IBI ahead). The first beat is
// bootstrapped to a real recent onset, never an arbitrary settling boundary. The gains are
// INTERNAL constants (API decision: not public). Tempo selection (T1/T1b/T2) is untouched —
// the PLL only refines phase/period locally around the ACF-chosen tempo.
var PLL_PHASE_GAIN = 0.25; // fraction of phase error applied as a phase nudge per beat
var PLL_TEMPO_GAIN = 0.03; // fraction of phase error folded into the period per beat
var PLL_MAX_PHASE_FRAC = 0.08; // |phaseCorr| clamp, fraction of the IBI
var PLL_MAX_TEMPO_FRAC = 0.02; // |ibiCorr| clamp, fraction of the IBI
var PLL_ACCEPT_FRAC = 0.25; // an onset within ±this·IBI of the prediction is "the" beat onset
var PLL_FREERUN_FRAC = 0.25; // free-run (grid) emit once the prediction is passed by this·IBI
var PLL_RESYNC_FRAC = 0.25; // re-seed the PLL period from the ACF tempo if it drifts beyond this
var PLL_BOOTSTRAP_MAX_AGE_IBI = 2.0; // bootstrap anchors to the newest onset within this many IBIs

// Mean-subtracted, biased (÷n), zero-lag-normalised ACF. Writes lagCount values into out.
function computeAcfInline(flux, n, minLag, maxLag, out) {
    var lagCount = maxLag - minLag + 1;
    var mean = 0;
    for (var t = 0; t < n; t++) { mean += flux[t]; }
    mean = n > 0 ? mean / n : 0;
    var zeroLag = 0;
    for (var z = 0; z < n; z++) { var cz = flux[z] - mean; zeroLag += cz * cz; }
    zeroLag = n > 0 ? zeroLag / n : 1;
    var norm = zeroLag > 0 ? zeroLag : 1;
    for (var lagIndex = 0; lagIndex < lagCount; lagIndex++) {
        var lag = minLag + lagIndex;
        var sum = 0;
        for (var t2 = lag; t2 < n; t2++) { sum += (flux[t2] - mean) * (flux[t2 - lag] - mean); }
        out[lagIndex] = n > 0 ? sum / n / norm : 0;
    }
}

// Linear-interpolated ACF sample; 0 outside range, negative correlation clamped to 0.
function acfAtLagInline(acf, acfLen, minLag, lag) {
    var maxIndex = acfLen - 1;
    var f = lag - minLag;
    if (f < 0 || f > maxIndex) { return 0; }
    var i0 = Math.floor(f);
    var i1 = i0 < maxIndex ? i0 + 1 : maxIndex;
    var frac = f - i0;
    var v = acf[i0] * (1 - frac) + acf[i1] * frac;
    return v > 0 ? v : 0;
}

function tempoPriorInline(bpm, mu, sigma) {
    var zp = Math.log(bpm / mu) / sigma;
    return Math.exp(-0.5 * zp * zp);
}

// Sub-lag peak refinement: fit a parabola through (i-1, i, i+1) and return the vertex
// offset in [-0.5, 0.5]. Gives sub-hop BPM resolution where the lag grid is coarse (the
// 300 BPM top end sits at lag ~19 hops, ~5 ms/lag). Mirrors parabolicPeakOffset.
function parabolicPeakOffsetInline(yPrev, yMid, yNext) {
    var denom = yPrev - 2 * yMid + yNext;
    if (denom >= 0) { return 0; }
    var d = (0.5 * (yPrev - yNext)) / denom;
    if (d < -0.5) { d = -0.5; } else if (d > 0.5) { d = 0.5; }
    return d;
}

// ---- Processor ----
class BeatDetectorProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        var opts = (options && options.processorOptions) || {};
        this._sampleRate = sampleRate;
        this._fftSize    = opts.fftSize    || 2048;
        this._hopSize    = opts.hopSize    || 512;
        this._minBpm     = opts.minBpm     || 50;
        this._maxBpm     = opts.maxBpm     || 300;
        this._melBands   = opts.melBands   || 24;
        this._settlingMs = opts.settlingMs !== undefined ? opts.settlingMs : 1500;
        this._tempoWindowSec = opts.tempoWindowSec || 6;
        this._enableTsDetection = opts.enableTimeSignatureDetection !== false;

        var numBins = this._fftSize >> 1;
        this._real = new Float32Array(this._fftSize);
        this._imag = new Float32Array(this._fftSize);
        this._mag  = new Float32Array(numBins);
        this._ringBuffer  = new Float32Array(this._fftSize);
        this._ringWritePos = 0;
        this._sampleCount  = 0;
        this._hopAccum     = 0;

        this._melBandFilters = buildMelFilterbank(this._melBands, 80, 8000, this._fftSize, this._sampleRate);
        this._melOut         = new Float32Array(this._melBands);
        var fluxWindowLen    = Math.ceil(this._tempoWindowSec * this._sampleRate / this._hopSize);
        this._fluxWindow     = new Float32Array(fluxWindowLen);
        this._linFlux        = new Float32Array(fluxWindowLen); // scratch: ring → linear (oldest first)
        this._fluxWritePos   = 0;
        this._fluxCount      = 0;
        var LAG_K = 3;
        this._prevMelFrames  = [];
        for (var i = 0; i < LAG_K; i++) {
            this._prevMelFrames.push(new Float32Array(this._melBands));
        }
        this._prevMelFrameIdx = 0;

        // Lag range in hops for BPM range
        this._minLag = Math.max(1, Math.round(60 / this._maxBpm * this._sampleRate / this._hopSize));
        this._maxLag = Math.round(60 / this._minBpm * this._sampleRate / this._hopSize);
        // ACF is computed down to a shorter lag than the candidate band (see tempogram.ts
        // acfExtendedMinLag): high-BPM fundamentals become interior peaks and the 2f/3f
        // super-harmonic penalty can read energy above maxBpm.
        this._acfMinLag = Math.max(1, Math.round(this._minLag / 3));
        this._acf    = new Float32Array(this._maxLag - this._acfMinLag + 1); // scratch ACF buffer

        this._hopsSinceACF = 0;
        var ACF_INTERVAL = 15;
        this._acfInterval = ACF_INTERVAL;

        // Tempo state
        this._bestBpm        = 0;
        this._bestScore      = 0;
        this._candidates     = [];
        this._firstLockSample = -1; // sample index of first lock (for hysteresis grace window)

        // Phase state
        this._lastBeatSample = -1;
        this._ibiSamples     = 0;  // PLL-tracked inter-beat interval (samples); seeded from ACF tempo
        this._ibiHistory     = new Float32Array(4); // last 4 inter-beat intervals
        this._ibiIdx         = 0;

        // Bar position state — parallel posteriors for 4/4 and 3/4
        this._posterior4    = new Float32Array([0.25, 0.25, 0.25, 0.25]);
        this._posterior3    = new Float32Array([1/3, 1/3, 1/3]);
        this._ts4Confidence = 0.5;
        this._ts3Confidence = 0.5;
        this._activeTs      = '4/4';
        this._sustainCounter = 0;
        this._barPosition   = 1; // 1-indexed
        this._barNumber     = 0;
        this._beatsSinceStart = 0;

        // Confidence
        this._confidence = 0;

        // State snapshot cadence (~20 Hz)
        var STATE_INTERVAL_HOPS = Math.round(this._sampleRate / this._hopSize / 20);
        this._stateInterval = Math.max(1, STATE_INTERVAL_HOPS);
        this._hopsSinceState = 0;

        // Settling
        this._startSample   = currentFrame;
        this._settledSamples = Math.round(this._settlingMs * 0.001 * this._sampleRate);

        // Lookahead
        this._lookahead = [];

        // RMS / onset state
        this._rms = 0;
        this._onsetStrength = 0; // per-hop normalised novelty (exposed to state + T4 PLL)

        // ---- Onset peak-picker state (T3) ----
        var onsetWinLen = Math.max(8, Math.round(ONSET_NORM_WINDOW_SEC * this._sampleRate / this._hopSize));
        this._onsetWin   = new Float32Array(onsetWinLen); // ring of recent raw flux (normalization)
        this._onsetWinPos = 0;
        this._onsetWinCount = 0;
        this._onsetSort  = new Float32Array(onsetWinLen); // scratch — sorted copy for median
        this._onsetDev   = new Float32Array(onsetWinLen); // scratch — |x − median| for MAD
        this._fluxPeak   = 0;     // decaying running flux maximum (noise-floor reference)
        this._onsetPrev1 = 0;     // normalised novelty at the previous hop (rising-edge detect)
        this._onsetHopCount  = 0;
        this._onsetFiredThisHop = false; // a confirmed onset peak was registered this hop
        // ---- Onset stream exposed for T4's PLL ----
        // _lastOnsetSample / _lastOnsetStrength = most recent confirmed onset (sub-hop precise);
        // the ring holds the last ONSET_RING_SIZE onsets so the PLL can pick nearestOnset().
        this._lastOnsetSample   = -1;
        this._lastOnsetStrength = 0;
        this._onsetRingSamples   = new Float32Array(ONSET_RING_SIZE);
        this._onsetRingStrengths = new Float32Array(ONSET_RING_SIZE);
        this._onsetRingPos   = 0;
        this._onsetRingCount = 0;

        // Band energy (for state messages)
        var LOW_BANDS  = Math.round(this._melBands * 0.25);
        var MID_BANDS  = Math.round(this._melBands * 0.6);
        this._lowBandEnd  = LOW_BANDS;
        this._midBandEnd  = MID_BANDS;
    }

    process(inputs, _outputs, _parameters) {
        var input = inputs[0];
        if (!input || input.length === 0) return true;

        var left  = input[0] || [];
        var right = input[1] || left;
        var blockLen = left.length;

        for (var s = 0; s < blockLen; s++) {
            // Mono downmix
            var mono = (left[s] + right[s]) * 0.5;

            // Accumulate RMS
            this._rms += mono * mono;

            // Fill ring buffer
            this._ringBuffer[this._ringWritePos] = mono;
            this._ringWritePos = (this._ringWritePos + 1) & (this._fftSize - 1);

            this._hopAccum++;
            this._sampleCount++;

            if (this._hopAccum >= this._hopSize) {
                this._hopAccum = 0;
                this._processHop();
            }
        }

        return true;
    }

    _processHop() {
        // Read ring buffer into real[] (oldest first)
        var rb = this._ringBuffer;
        var wp = this._ringWritePos;
        var n  = this._fftSize;
        for (var i = 0; i < n; i++) {
            this._real[i] = rb[(wp + i) & (n - 1)];
        }

        // FFT
        fftInPlace(this._real, this._imag);

        // Magnitude spectrum
        var bins = n >> 1;
        for (var i = 0; i < bins; i++) {
            this._mag[i] = Math.sqrt(this._real[i]*this._real[i] + this._imag[i]*this._imag[i]);
        }

        // RMS (from time domain, using ring buffer)
        var rmsAccum = 0;
        for (var i = 0; i < n; i++) {
            rmsAccum += rb[(wp + i) & (n - 1)] * rb[(wp + i) & (n - 1)];
        }
        this._rms = Math.sqrt(rmsAccum / n);

        // Mel bands
        computeMelBands(this._mag, this._melBandFilters, this._melOut);

        // Spectral flux (SuperFlux-lite, lag k=3)
        var K = this._prevMelFrames.length;
        var flux = 0;
        for (var b = 0; b < this._melBands; b++) {
            var localMax = -Infinity;
            for (var k = 0; k < K; k++) {
                var prevVal = this._prevMelFrames[k][b];
                if (prevVal > localMax) localMax = prevVal;
            }
            var diff = this._melOut[b] - localMax;
            if (diff > 0) flux += diff;
        }

        // Store current mel frame in circular buffer
        var prevFrame = this._prevMelFrames[this._prevMelFrameIdx];
        for (var b = 0; b < this._melBands; b++) {
            prevFrame[b] = this._melOut[b];
        }
        this._prevMelFrameIdx = (this._prevMelFrameIdx + 1) % K;

        // Add flux to sliding window
        this._fluxWindow[this._fluxWritePos] = flux;
        this._fluxWritePos = (this._fluxWritePos + 1) % this._fluxWindow.length;
        if (this._fluxCount < this._fluxWindow.length) this._fluxCount++;

        // Adaptive onset normalization + peak-picking (T3). Runs every hop (independent
        // of the ACF/tempo path, which still consumes the raw _fluxWindow above).
        this._detectOnset(flux);

        // Tempogram: compute ACF periodically
        this._hopsSinceACF++;
        if (this._hopsSinceACF >= this._acfInterval && this._fluxCount >= this._maxLag + 1) {
            this._hopsSinceACF = 0;
            this._computeACFAndCandidates();
        }

        // Phase tracker — runs as soon as a tempo is locked. It is no longer gated on the
        // full settling window: the PLL bootstraps its phase from a real onset, so beats are
        // not lost to warm-up (the state-message tempo report still honours settling). Lock
        // itself cannot occur before the flux window holds ≥ maxLag+1 hops (~1.2 s at minBpm).
        if (this._bestBpm > 0) {
            this._tickPhase(flux);
        }

        // State snapshot
        this._hopsSinceState++;
        if (this._hopsSinceState >= this._stateInterval) {
            this._hopsSinceState = 0;
            this._sendStateMessage();
        }
    }

    _computeACFAndCandidates() {
        var n   = this._fluxCount;
        var buf = this._fluxWindow;
        var wp  = this._fluxWritePos;
        var len = buf.length;
        var minLag  = this._acfMinLag;        // extended ACF base (see constructor)
        var maxLag  = this._maxLag;
        var numLags = maxLag - minLag + 1;
        var loBpm   = this._minBpm * 0.95;    // CANDIDATE_EDGE_TOLERANCE = 0.05
        var hiBpm   = this._maxBpm * 1.05;

        // Linearise the flux ring buffer (oldest first) into a scratch array so the ACF
        // operates on the same layout src/dsp/tempogram.computeAcf expects.
        var lin = this._linFlux;
        for (var t = 0; t < n; t++) {
            lin[t] = buf[((wp - 1 - (n - 1 - t)) % len + len) % len];
        }

        // ACF (mean-subtracted, biased, zero-lag normalised) — mirrors computeAcf.
        var acf = this._acf;
        computeAcfInline(lin, n, minLag, maxLag, acf);

        // Raw positive peaks (interior + endpoints) — mirrors findTempoPeaks.
        var peaks = [];
        var lastIdx = numLags - 1;
        if (numLags > 1 && acf[0] > acf[1] && acf[0] > 0) {
            peaks.push({ bpm: 60 * this._sampleRate / (minLag * this._hopSize), score: acf[0], lag: minLag });
        }
        for (var i = 1; i < lastIdx; i++) {
            if (acf[i] > acf[i-1] && acf[i] > acf[i+1] && acf[i] > 0) {
                var lagI = minLag + i + parabolicPeakOffsetInline(acf[i-1], acf[i], acf[i+1]);
                peaks.push({ bpm: 60 * this._sampleRate / (lagI * this._hopSize), score: acf[i], lag: lagI });
            }
        }
        if (numLags > 1 && acf[lastIdx] > acf[lastIdx-1] && acf[lastIdx] > 0) {
            var lagL = minLag + lastIdx;
            peaks.push({ bpm: 60 * this._sampleRate / (lagL * this._hopSize), score: acf[lastIdx], lag: lagL });
        }
        peaks.sort(function(a, b) { return b.score - a.score; });

        // Filter to BPM range (with edge tolerance) — mirrors computeTempoCandidates filter.
        var inRange = [];
        for (var pf = 0; pf < peaks.length; pf++) {
            if (peaks[pf].bpm >= loBpm && peaks[pf].bpm <= hiBpm) inRange.push(peaks[pf]);
        }

        // Comb (own sub-multiples) − super-harmonic penalty, × tempo prior.
        // Mirrors scoreTempoHypotheses. The penalty is what defeats the octave-down bias.
        // The penalty is SUBDIVISION-AWARE: a super-harmonic kf only demotes f when kf is
        // itself a plausible beat (kf <= maxBpm). Energy above maxBpm is a subdivision (hats
        // on 8ths over a 180 kick), not a competing fundamental, so it must not demote f.
        var superHi = hiBpm; // maxBpm * 1.05 (CANDIDATE_EDGE_TOLERANCE)
        var scored = [];
        for (var q = 0; q < inRange.length; q++) {
            var lag    = inRange[q].lag;
            var aF     = acfAtLagInline(acf, numLags, minLag, lag);
            var aHalf  = acfAtLagInline(acf, numLags, minLag, lag * 2);
            var aThird = acfAtLagInline(acf, numLags, minLag, lag * 3);
            var aDouble = acfAtLagInline(acf, numLags, minLag, lag / 2);
            var aTriple = acfAtLagInline(acf, numLags, minLag, lag / 3);
            var support = COMB_W_FUNDAMENTAL * aF + COMB_W_HALF * aHalf + COMB_W_THIRD * aThird;
            var penDbl  = inRange[q].bpm * 2 <= superHi ? COMB_PENALTY_DOUBLE * aDouble : 0;
            var penTrip = inRange[q].bpm * 3 <= superHi ? COMB_PENALTY_TRIPLE * aTriple : 0;
            var comb = support - penDbl - penTrip;
            if (comb < 0) comb = 0;
            var w = tempoPriorInline(inRange[q].bpm, TEMPO_PRIOR_MU, TEMPO_PRIOR_SIGMA);
            scored.push({ bpm: inRange[q].bpm, score: comb * w, lag: lag });
        }
        scored.sort(function(a, b) { return b.score - a.score; });

        this._candidates = scored.slice(0, 3);
        if (this._candidates.length === 0) return;

        var top = this._candidates[0];

        // Octave-aware hysteresis with a short first-lock grace window.
        if (this._bestBpm <= 0) {
            // First lock
            this._bestBpm   = top.bpm;
            this._bestScore = top.score;
            this._firstLockSample = this._sampleCount;
        } else {
            // Fresh score of the currently-tracked tempo from this frame.
            var currentScore = 0;
            for (var c = 0; c < this._candidates.length; c++) {
                if (Math.abs(this._candidates[c].bpm / this._bestBpm - 1) < 0.03) {
                    if (this._candidates[c].score > currentScore) currentScore = this._candidates[c].score;
                }
            }
            if (currentScore <= 0) currentScore = this._bestScore * 0.9;

            var inGrace = this._firstLockSample >= 0 &&
                          (this._sampleCount - this._firstLockSample) < 2 * this._sampleRate;
            var ratio = top.bpm / this._bestBpm;
            // Metrically-related = same beat at another level (octaves + 3:2/2:3 dotted/triple).
            // Switching across these needs the strong margin so subdivision artefacts (e.g. the
            // 120 "dotted" grouping of a drifting 180 kit) cannot steal the lock. Mirrors
            // isOctaveRelated in src/dsp/tempogram.ts.
            var isOctave = Math.abs(ratio - 0.5) < 0.05 || Math.abs(ratio - 2) < 0.1 ||
                           Math.abs(ratio - 3) < 0.15 || Math.abs(ratio - 1/3) < 0.05 ||
                           Math.abs(ratio - 2/3) < 0.04 || Math.abs(ratio - 3/2) < 0.06;
            var margin = inGrace ? 1.0 : (isOctave ? 1.5 : 1.15);
            var diff = Math.abs(top.bpm - this._bestBpm) / this._bestBpm;

            if (diff > 0.03 && top.score > currentScore * margin) {
                var oldBpm = this._bestBpm;
                this._bestBpm   = top.bpm;
                this._bestScore = top.score;
                // Only fire tempoChange if > 5% different
                if (Math.abs(this._bestBpm - oldBpm) / oldBpm > 0.05) {
                    this.port.postMessage({ type: 'tempoChange', newTempo: this._bestBpm, oldTempo: oldBpm });
                }
            } else {
                this._bestScore = currentScore;
            }
        }

        this._updateConfidence();
    }

    // Minimum spacing (samples) between two detected onsets. Once a tempo is locked the
    // refractory tracks the beat (a fraction of the IBI); before lock it is a fixed floor.
    _onsetRefractorySamples() {
        var minR = ONSET_MIN_REFRACTORY_SEC * this._sampleRate;
        if (this._bestBpm > 0) {
            var r = ONSET_REFRACTORY_IBI_FRAC * (60 / this._bestBpm * this._sampleRate);
            return r > minR ? r : minR;
        }
        return minR;
    }

    // Adaptive onset detection (T3). Normalises the raw flux against a running median/MAD
    // baseline (so soft and hard onsets are comparable), then picks onsets on the UPWARD
    // crossing of an adaptive threshold (the onset attack), gated by a noise floor and an
    // IBI-derived refractory. Updates the per-hop _onsetStrength and the detected-onset
    // stream consumed by T4's PLL.
    _detectOnset(flux) {
        // Decaying running flux maximum — the reference level for the noise floor.
        this._fluxPeak *= ONSET_PEAK_DECAY;
        if (flux > this._fluxPeak) this._fluxPeak = flux;

        // Push raw flux into the normalization ring.
        var W = this._onsetWin.length;
        this._onsetWin[this._onsetWinPos] = flux;
        this._onsetWinPos = (this._onsetWinPos + 1) % W;
        if (this._onsetWinCount < W) this._onsetWinCount++;
        var count = this._onsetWinCount;

        // Robust baseline: median of the window, then MAD = median(|x − median|).
        var s = this._onsetSort;
        for (var i = 0; i < count; i++) s[i] = this._onsetWin[i];
        var sub = s.subarray(0, count);
        sub.sort();
        var median = sub[count >> 1];
        var d = this._onsetDev;
        for (var j = 0; j < count; j++) { var dv = this._onsetWin[j] - median; d[j] = dv < 0 ? -dv : dv; }
        var dsub = d.subarray(0, count);
        dsub.sort();
        var mad = dsub[count >> 1];

        // Normalised novelty: deviation above baseline in robust-σ units, with the scale
        // floored at a fraction of the running peak so a clean (MAD≈0) clicktrack still
        // yields a finite, comparable onset strength instead of a divide-by-zero spike.
        var floorScale = ONSET_NOISE_FLOOR_FRAC * this._fluxPeak;
        var madScaled = ONSET_MAD_SCALE * mad;
        var denom = madScaled > floorScale ? madScaled : floorScale;
        if (denom < 1e-9) denom = 1e-9;
        var norm = (flux - median) / denom;
        if (norm < 0) norm = 0;
        this._onsetStrength = norm;

        // Rising-edge onset detection on the normalised novelty: fire on the UPWARD crossing
        // of the adaptive threshold — the onset attack, exactly where the old crude heuristic
        // fired, so the shipped beat-offset behaviour is preserved — gated by the noise floor
        // and an IBI-derived refractory. Zero lookahead latency.
        this._onsetFiredThisHop = false;
        var noiseFloor = floorScale;
        var refractory = this._onsetRefractorySamples();
        var crossedUp = this._onsetHopCount >= 1 && this._onsetPrev1 <= ONSET_THRESHOLD && norm > ONSET_THRESHOLD;
        var aboveFloor = flux > noiseFloor && flux > ONSET_ABS_FLOOR;
        var pastRefractory = this._lastOnsetSample < 0 || (this._sampleCount - this._lastOnsetSample) >= refractory;
        if (crossedUp && aboveFloor && pastRefractory) {
            // Sub-hop onset position: linear-interpolate the threshold crossing between the
            // previous hop and this one (stored for T4's PLL; the T3 grid snap uses the integer
            // hop so the shipped beat-offset numbers are preserved).
            var span = norm - this._onsetPrev1;
            var frac = span > 1e-9 ? (ONSET_THRESHOLD - this._onsetPrev1) / span : 0;
            if (frac < 0) frac = 0; else if (frac > 1) frac = 1;
            var onsetSample = (this._sampleCount - this._hopSize) + frac * this._hopSize;
            this._lastOnsetSample   = onsetSample;
            this._lastOnsetStrength = norm;
            this._onsetFiredThisHop = true;
            this._onsetRingSamples[this._onsetRingPos]   = onsetSample;
            this._onsetRingStrengths[this._onsetRingPos] = norm;
            this._onsetRingPos = (this._onsetRingPos + 1) % this._onsetRingSamples.length;
            if (this._onsetRingCount < this._onsetRingSamples.length) this._onsetRingCount++;
        }

        // Shift history for the next hop.
        this._onsetPrev1 = norm;
        this._onsetHopCount++;
    }

    // Onset CLOSEST to targetSample within ±windowSamples (sub-hop precise, from the T3 ring) —
    // the PLL's nearestOnset(): the phase-error reference for the period/phase correction. Using
    // the closest (not the loudest) onset keeps the loop locked to the phase it is tracking; a
    // louder neighbour (e.g. a bright off-beat hat) must not be allowed to yank the grid.
    // Returns the onset sample, or -1 if none.
    _nearestOnset(targetSample, windowSamples) {
        var best = -1;
        var bestDist = windowSamples + 1;
        var cnt = this._onsetRingCount;
        for (var i = 0; i < cnt; i++) {
            var s = this._onsetRingSamples[i];
            if (s < 0) continue;
            var d = s - targetSample;
            if (d < 0) d = -d;
            if (d <= windowSamples && d < bestDist) { bestDist = d; best = s; }
        }
        return best;
    }

    // Strongest onset no older than maxAgeSamples (ties → most recent) — the phase anchor for
    // the first beat. Anchoring to the strongest recent transient, rather than merely the
    // latest, biases the bootstrap toward a real beat onset. Always a real onset — never the old
    // arbitrary settling boundary. Returns the anchor sample, or -1 if the ring is empty.
    _bootstrapOnset(maxAgeSamples) {
        var best = -1;
        var bestStrength = -1;
        var cnt = this._onsetRingCount;
        for (var i = 0; i < cnt; i++) {
            var s = this._onsetRingSamples[i];
            if (s < 0 || (this._sampleCount - s) > maxAgeSamples) continue;
            var st = this._onsetRingStrengths[i];
            if (st > bestStrength || (st === bestStrength && s > best)) { bestStrength = st; best = s; }
        }
        return best;
    }

    // Emit exactly one beat at beatSample (samples). Centralises the bar/confidence/lookahead
    // bookkeeping + port messages so the PLL and the bootstrap share one emission path.
    _emitBeat(beatSample, flux) {
        var beatTime = beatSample / this._sampleRate;

        // Update IBI history with the current PLL period.
        this._ibiHistory[this._ibiIdx] = this._ibiSamples;
        this._ibiIdx = (this._ibiIdx + 1) & 3;

        this._beatsSinceStart++;
        this._updateBarPosition(flux);
        this._updateConfidence();
        this._updateLookahead(beatTime);

        var isDownbeat = this._barPosition === 1;
        this.port.postMessage({
            type: 'beat',
            audioTime: beatTime,
            tempo: this._bestBpm,
            confidence: this._confidence,
            beatPhase: 0,
            energy: flux,
            isDownbeat: isDownbeat,
            beatInBar: this._barPosition,
        });

        if (isDownbeat) {
            this.port.postMessage({
                type: 'barStart',
                audioTime: beatTime,
                tempo: this._bestBpm,
                confidence: this._confidence,
                barNumber: this._barNumber,
            });
        }
    }

    // Bounded PLL beat-phase tracker (T4). Predicts the next beat at lastBeat + ibi, corrects
    // phase + period toward the nearest onset (clamped), and emits exactly one beat per
    // predicted beat. Free-runs on the grid when an onset is missing; coasts (advances the
    // grid but stops emitting) during sustained silence so breaks don't spawn phantom beats.
    _tickPhase(flux) {
        var acfIbi = 60 / this._bestBpm * this._sampleRate;

        // Bootstrap: anchor the first beat to a real recent onset (never an arbitrary
        // boundary). Emit it — it is a genuine, just-detected transient — so the leading
        // on-grid beat is not lost to warm-up. If no onset has arrived yet, wait.
        if (this._lastBeatSample < 0) {
            var anchor = this._bootstrapOnset(PLL_BOOTSTRAP_MAX_AGE_IBI * acfIbi);
            if (anchor < 0) return;
            this._ibiSamples = acfIbi;
            this._lastBeatSample = anchor;
            this._emitBeat(anchor, flux);
            return;
        }

        // Keep the PLL period anchored to the ACF tempo: it may track drift within the bounded
        // tempoGain, but a large gap (octave re-lock / tempoChange) re-seeds it so the loop
        // never chases a stale interval. Tempo SELECTION is unchanged — this only refines the
        // local period the phase tracker runs on.
        if (this._ibiSamples <= 0) this._ibiSamples = acfIbi;
        if (Math.abs(this._ibiSamples - acfIbi) > PLL_RESYNC_FRAC * acfIbi) {
            this._ibiSamples = acfIbi;
        }
        var ibi = this._ibiSamples;

        var predicted = this._lastBeatSample + ibi;
        var acceptWin = PLL_ACCEPT_FRAC * ibi;

        // Still early in the beat cycle — wait until we approach the prediction.
        if (this._sampleCount < predicted - acceptWin) return;

        var onset = this._nearestOnset(predicted, acceptWin);

        var beatSample;
        if (onset >= 0) {
            // Bounded phase + period correction toward the matched onset.
            var error = onset - predicted;
            var maxPhase = PLL_MAX_PHASE_FRAC * ibi;
            var phaseCorr = error * PLL_PHASE_GAIN;
            if (phaseCorr > maxPhase) phaseCorr = maxPhase; else if (phaseCorr < -maxPhase) phaseCorr = -maxPhase;
            var maxTempo = PLL_MAX_TEMPO_FRAC * ibi;
            var ibiCorr = error * PLL_TEMPO_GAIN;
            if (ibiCorr > maxTempo) ibiCorr = maxTempo; else if (ibiCorr < -maxTempo) ibiCorr = -maxTempo;
            beatSample = predicted + phaseCorr;
            this._ibiSamples = ibi + ibiCorr;
        } else if (this._sampleCount >= predicted + PLL_FREERUN_FRAC * ibi) {
            // Prediction passed with no matching onset → free-run on the grid (period held).
            beatSample = predicted;
        } else {
            // Inside the accept window with no onset yet — give a late onset a chance next hop.
            return;
        }

        // Advance the grid by exactly one beat.
        this._lastBeatSample = beatSample;

        // Coast gate (T3): after a sustained onset gap (break / silence) keep the grid
        // advancing but STOP emitting — this is what holds the breakDrop false-positive rate
        // down. Onset-rich material never trips it.
        var coasting = this._lastOnsetSample >= 0 &&
            (this._sampleCount - this._lastOnsetSample) > ONSET_BEAT_COAST_IBI * ibi;
        if (coasting) return;

        this._emitBeat(beatSample, flux);
    }

    _computeBeatLikelihood(flux) {
        var count = Math.min(this._fluxCount, 32);
        var wp = this._fluxWritePos;
        var len = this._fluxWindow.length;
        var totalFlux = 0;
        for (var i = 0; i < count; i++) {
            totalFlux += this._fluxWindow[(wp - 1 - i + len) % len];
        }
        var mean = count > 0 ? totalFlux / count : 1;
        return Math.max(0.5, Math.min(1.5, mean > 0 ? flux / mean : 1));
    }

    _updateBarPosition(flux) {
        var likelihood = this._computeBeatLikelihood(flux);

        // --- 4/4 posterior ---
        var p4 = this._posterior4;
        var s4 = new Float32Array(4);
        s4[0] = p4[3]; s4[1] = p4[0]; s4[2] = p4[1]; s4[3] = p4[2];
        var sum4 = 0;
        for (var i = 0; i < 4; i++) {
            p4[i] = s4[i] * (likelihood + (i === 0 ? 0.3 : 0));
            sum4 += p4[i];
        }
        if (sum4 > 0) { for (var i = 0; i < 4; i++) p4[i] /= sum4; }

        // --- 3/4 posterior ---
        var p3 = this._posterior3;
        var s3 = new Float32Array(3);
        s3[0] = p3[2]; s3[1] = p3[0]; s3[2] = p3[1];
        var sum3 = 0;
        for (var i = 0; i < 3; i++) {
            p3[i] = s3[i] * (likelihood + (i === 0 ? 0.3 : 0));
            sum3 += p3[i];
        }
        if (sum3 > 0) { for (var i = 0; i < 3; i++) p3[i] /= sum3; }

        // --- Update TS confidences (EMA) ---
        var max4 = 0;
        for (var i = 0; i < 4; i++) { if (p4[i] > max4) max4 = p4[i]; }
        var max3 = 0;
        for (var i = 0; i < 3; i++) { if (p3[i] > max3) max3 = p3[i]; }
        var alpha = 0.1;
        this._ts4Confidence = (1 - alpha) * this._ts4Confidence + alpha * max4;
        this._ts3Confidence = (1 - alpha) * this._ts3Confidence + alpha * max3;

        // --- Hysteresis switching ---
        if (this._enableTsDetection && this._beatsSinceStart > 8) {
            var minSwitchMargin = 1.4;
            var minSustainBeats = 12; // ~4 bars * 3 beats
            var threeFavored = this._ts3Confidence > this._ts4Confidence * minSwitchMargin;
            var fourFavored  = this._ts4Confidence > this._ts3Confidence * minSwitchMargin;

            if (this._activeTs === '4/4' && threeFavored) {
                this._sustainCounter++;
                if (this._sustainCounter >= minSustainBeats) {
                    this._activeTs = '3/4';
                    this._sustainCounter = 0;
                }
            } else if (this._activeTs === '3/4' && fourFavored) {
                this._sustainCounter++;
                if (this._sustainCounter >= minSustainBeats + 4) { // 16 beats for 4/4
                    this._activeTs = '4/4';
                    this._sustainCounter = 0;
                }
            } else {
                this._sustainCounter = 0;
            }
        }

        // --- Determine bar position from active TS ---
        var barLen = this._activeTs === '3/4' ? 3 : 4;
        var posterior = this._activeTs === '3/4' ? p3 : p4;

        if (this._beatsSinceStart >= barLen) {
            var maxP = -1, maxI = 0;
            for (var i = 0; i < barLen; i++) {
                if (posterior[i] > maxP) { maxP = posterior[i]; maxI = i; }
            }
            var newPos = maxI + 1; // 1-indexed
            if (newPos === 1 && this._barPosition !== 1) {
                this._barNumber++;
            }
            this._barPosition = newPos;
        } else {
            // Just advance sequentially
            this._barPosition = ((this._barPosition) % barLen) + 1;
            if (this._barPosition === 1) this._barNumber++;
        }
    }

    _updateConfidence() {
        if (this._candidates.length === 0) {
            this._confidence = 0;
            return;
        }

        // Peak contrast
        var top1 = this._candidates[0] ? this._candidates[0].score : 0;
        var top2 = this._candidates[1] ? this._candidates[1].score : top1;
        var top3 = this._candidates[2] ? this._candidates[2].score : top2;
        var peakContrast = (top2 + top3) > 0 ? top1 / ((top2 + top3) / 2) : 1;

        // Phase consistency from IBI variance
        var ibiMean = 0;
        for (var i = 0; i < 4; i++) ibiMean += this._ibiHistory[i];
        ibiMean /= 4;
        var ibiVar = 0;
        for (var i = 0; i < 4; i++) {
            var d = this._ibiHistory[i] - ibiMean;
            ibiVar += d * d;
        }
        ibiVar /= 4;
        var phaseConsistency = ibiMean > 0 ? Math.max(0, 1 - ibiVar / (ibiMean * ibiMean)) : 0;

        // Bar consistency (use the active posterior)
        var activePosterior = this._activeTs === '3/4' ? this._posterior3 : this._posterior4;
        var activeLen = this._activeTs === '3/4' ? 3 : 4;
        var maxP = 0;
        for (var i = 0; i < activeLen; i++) {
            if (activePosterior[i] > maxP) maxP = activePosterior[i];
        }
        var barConsistency = maxP;

        var c = Math.sqrt(Math.max(0, peakContrast / 2)) *
                Math.sqrt(Math.max(0, phaseConsistency)) *
                (0.5 + 0.5 * barConsistency);
        this._confidence = Math.max(0, Math.min(1, c));
    }

    _updateLookahead(lastBeatTime) {
        var lookahead = [];
        var beatInterval = 60 / this._bestBpm;
        var barPos = this._barPosition;
        var barLen = this._activeTs === '3/4' ? 3 : 4;
        for (var i = 0; i < 8; i++) {
            var t = lastBeatTime + (i + 1) * beatInterval;
            var bp = ((barPos - 1 + i) % barLen) + 1;
            lookahead.push({
                audioTime: t,
                tempo: this._bestBpm,
                isDownbeat: bp === 1,
                beatInBar: bp,
            });
        }
        this._lookahead = lookahead;
    }

    _computeBandEnergy() {
        var low = 0, mid = 0, high = 0;
        for (var b = 0; b < this._lowBandEnd; b++) low += this._melOut[b];
        for (var b = this._lowBandEnd; b < this._midBandEnd; b++) mid += this._melOut[b];
        for (var b = this._midBandEnd; b < this._melBands; b++) high += this._melOut[b];
        var denom = this._lowBandEnd || 1;
        return {
            low:  low  / denom,
            mid:  mid  / Math.max(1, this._midBandEnd - this._lowBandEnd),
            high: high / Math.max(1, this._melBands - this._midBandEnd),
        };
    }

    _sendStateMessage() {
        var settled = (this._sampleCount - this._settledSamples) > 0;
        var beatInterval = this._bestBpm > 0 ? 60 / this._bestBpm : 0;
        var currentTime = this._sampleCount / this._sampleRate;
        var lastBeatTime = this._lastBeatSample >= 0 ? this._lastBeatSample / this._sampleRate : 0;
        var beatPhase = beatInterval > 0
            ? Math.min(1, (currentTime - lastBeatTime) / beatInterval)
            : 0;
        var nextBeatTime = lastBeatTime + beatInterval;

        var nextDownbeatTime = nextBeatTime;
        for (var i = 0; i < this._lookahead.length; i++) {
            if (this._lookahead[i].isDownbeat) {
                nextDownbeatTime = this._lookahead[i].audioTime;
                break;
            }
        }

        var be = this._computeBandEnergy();

        this.port.postMessage({
            type: 'state',
            tempo: settled ? this._bestBpm : 0,
            beatPhase: beatPhase,
            confidence: settled ? this._confidence : 0,
            gridStability: settled ? this._confidence : 0,
            tempoCandidates: settled ? this._candidates.map(function(c) {
                return { bpm: c.bpm, score: c.score };
            }) : [],
            rms: this._rms,
            onsetStrength: this._onsetStrength,
            bandEnergy: be,
            barPosition: this._barPosition,
            barLength: this._activeTs === '3/4' ? 3 : 4,
            timeSignature: this._activeTs === '3/4'
                ? { numerator: 3, denominator: 4 }
                : { numerator: 4, denominator: 4 },
            lookahead: this._lookahead,
            nextBeatTime: settled ? nextBeatTime : 0,
            nextDownbeatTime: settled ? nextDownbeatTime : 0,
        });
    }
}

registerProcessor('exojs-beat-detector', BeatDetectorProcessor);
`;
