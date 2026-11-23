import { readFileSync, writeFileSync } from 'node:fs';

const file = 'site/scripts/playground-e2e.ts';
let source = readFileSync(file, 'utf8');

const browserTrace = `(() => {
  const trace = scope => event => {
    if (event.type === 'keydown' && event.code === 'KeyR' && event.isTrusted) {
      globalThis.__keyDeliveryReceived = true;
    }
    console.info('[key-delivery]', JSON.stringify({
      scope,
      event: event.type,
      target: event.target instanceof Element ? event.target.tagName : String(event.target),
      key: event instanceof KeyboardEvent ? event.key : undefined,
      trusted: event.isTrusted,
      timestamp: event.timeStamp,
      observedAt: performance.now(),
      active: document.activeElement?.tagName,
      focused: document.hasFocus(),
      visibility: document.visibilityState,
    }));
  };

  const fromWindow = trace('window');
  for (const type of ['focus', 'blur', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup']) {
    window.addEventListener(type, fromWindow, { capture: true, passive: true });
  }
  const fromDocument = trace('document');
  for (const type of ['keydown', 'keyup', 'visibilitychange']) {
    document.addEventListener(type, fromDocument, { capture: true, passive: true });
  }
})()`;

const engineTrace = `(() => {
  const app = globalThis.__acceptanceApp;
  for (const [event, signal] of [['keydown', app.input.onKeyDown], ['keyup', app.input.onKeyUp]]) {
    signal.add(channel => {
      console.info('[key-delivery]', JSON.stringify({ scope: 'engine', event, channel, observedAt: performance.now() }));
    });
  }
})()`;

const insertAfter = (anchor: string, addition: string): void => {
  if (source.split(anchor).length !== 2) {
    throw new Error(`Expected exactly one diagnostic source anchor: ${anchor}`);
  }

  source = source.replace(anchor, () => anchor + addition);
};

insertAfter(
  'const check = async (name: string, run: () => Promise<void>): Promise<void> => {',
  `
  if (!name.startsWith('acceptance audio bus:') && !name.startsWith('featured example layout:')) {
    return;
  }
`,
);

insertAfter(
  '          assert(response.ok(), `Cannot load served example ${example}: HTTP ${response.status()}`);',
  `
          if (example === 'showcase/boss-intro-cinematic') {
            await page.evaluate(${JSON.stringify(browserTrace)});
          }
`,
);

insertAfter(
  "            await readable('start');",
  `
            page.on('console', message => {
              if (message.text().startsWith('[key-delivery]')) {
                console.log(width, message.text());
              }
            });
            await page.evaluate(${JSON.stringify(engineTrace)});
`,
);

const replayOnRelease = `            await page.keyboard.press('r', { delay: 50 });
            await waitFor(sequence, value => !value.finished, 'keyboard replay to restart the sequence', 30_000);`;

if (source.split(replayOnRelease).length !== 2) {
  throw new Error('Expected exactly one keyboard replay check');
}

source = source.replace(
  replayOnRelease,
  `            await page.keyboard.down('r');
            try {
              await waitFor(sequence, value => !value.finished, 'keyboard replay on keydown', 30_000);
              assert(await page.evaluate('globalThis.__keyDeliveryReceived === true'), 'replay requires trusted KeyR');
            } finally {
              await page.keyboard.up('r');
            }`,
);

writeFileSync(file, source);
