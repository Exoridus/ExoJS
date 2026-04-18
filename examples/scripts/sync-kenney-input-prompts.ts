import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceRoot = process.env.KENNEY_INPUT_PROMPTS_DIR
    ? path.resolve(projectRoot, process.env.KENNEY_INPUT_PROMPTS_DIR)
    : 'C:/Users/User/Desktop/kenney_input-prompts_1.4.1';

const targetImageDir = path.resolve(projectRoot, 'public', 'assets', 'image');
const targetJsonDir = path.resolve(projectRoot, 'public', 'assets', 'json');

interface Attributes {
    [key: string]: string;
}

interface SpriteFrame {
    frame: { x: number; y: number; w: number; h: number };
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    sourceSize: { w: number; h: number };
    pivot: { x: number; y: number };
}

const profiles = [
    {
        key: 'generic',
        sourcePng: 'Generic/generic_sheet_default.png',
        sourceXml: 'Generic/generic_sheet_default.xml',
        outputPng: 'input-prompts-generic.png',
        outputJson: 'input-prompts-generic.json',
    },
    {
        key: 'xbox',
        sourcePng: 'Xbox Series/xbox-series_sheet_default.png',
        sourceXml: 'Xbox Series/xbox-series_sheet_default.xml',
        outputPng: 'input-prompts-xbox-series.png',
        outputJson: 'input-prompts-xbox-series.json',
    },
    {
        key: 'playstation',
        sourcePng: 'PlayStation Series/playstation-series_sheet_default.png',
        sourceXml: 'PlayStation Series/playstation-series_sheet_default.xml',
        outputPng: 'input-prompts-playstation-series.png',
        outputJson: 'input-prompts-playstation-series.json',
    },
    {
        key: 'switch',
        sourcePng: 'Nintendo Switch/nintendo-switch_sheet_default.png',
        sourceXml: 'Nintendo Switch/nintendo-switch_sheet_default.xml',
        outputPng: 'input-prompts-nintendo-switch.png',
        outputJson: 'input-prompts-nintendo-switch.json',
    },
];

const parseAttributes = (source: string): Attributes => {
    const attributes: Attributes = {};
    const regex = /(\w+)="([^"]*)"/g;
    let match = regex.exec(source);

    while (match !== null) {
        attributes[match[1]] = match[2];
        match = regex.exec(source);
    }

    return attributes;
};

const parseAtlas = (xmlSource: string): { imagePath: string; frames: Record<string, SpriteFrame>; size: { w: number; h: number } } => {
    const atlasMatch = xmlSource.match(/<TextureAtlas\s+([^>]+)>/);

    if (!atlasMatch) {
        throw new Error('Missing <TextureAtlas> root element.');
    }

    const atlasAttributes = parseAttributes(atlasMatch[1]);
    const frames: Record<string, SpriteFrame> = {};
    let maxX = 0;
    let maxY = 0;

    const frameRegex = /<SubTexture\s+([^/>]+?)\s*\/>/g;
    let frameMatch = frameRegex.exec(xmlSource);

    while (frameMatch !== null) {
        const frameAttributes = parseAttributes(frameMatch[1]);
        const name = frameAttributes.name;
        const x = Number(frameAttributes.x || 0);
        const y = Number(frameAttributes.y || 0);
        const width = Number(frameAttributes.width || frameAttributes.w || 0);
        const height = Number(frameAttributes.height || frameAttributes.h || 0);

        if (!name) {
            throw new Error('Encountered <SubTexture> without a name.');
        }

        frames[name] = {
            frame: { x, y, w: width, h: height },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: width, h: height },
            sourceSize: { w: width, h: height },
            pivot: { x: 0.5, y: 0.5 },
        };

        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);

        frameMatch = frameRegex.exec(xmlSource);
    }

    return {
        imagePath: atlasAttributes.imagePath || '',
        frames,
        size: {
            w: maxX,
            h: maxY,
        },
    };
};

const ensureExists = (filePath: string): void => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing required file: ${filePath}`);
    }
};

const run = (): void => {
    if (!fs.existsSync(sourceRoot)) {
        throw new Error(
            `Input prompts source folder not found: ${sourceRoot}. Set KENNEY_INPUT_PROMPTS_DIR to override.`
        );
    }

    fs.mkdirSync(targetImageDir, { recursive: true });
    fs.mkdirSync(targetJsonDir, { recursive: true });

    for (const profile of profiles) {
        const sourcePngPath = path.resolve(sourceRoot, profile.sourcePng);
        const sourceXmlPath = path.resolve(sourceRoot, profile.sourceXml);
        const targetPngPath = path.resolve(targetImageDir, profile.outputPng);
        const targetJsonPath = path.resolve(targetJsonDir, profile.outputJson);

        ensureExists(sourcePngPath);
        ensureExists(sourceXmlPath);

        const xmlSource = fs.readFileSync(sourceXmlPath, 'utf8');
        const atlas = parseAtlas(xmlSource);

        fs.copyFileSync(sourcePngPath, targetPngPath);

        const atlasJson = {
            frames: atlas.frames,
            meta: {
                app: 'kenney-input-prompts-xml-converter',
                version: '1.0',
                image: profile.outputPng,
                format: 'RGBA8888',
                size: atlas.size,
                scale: '1',
            },
        };

        fs.writeFileSync(targetJsonPath, `${JSON.stringify(atlasJson, null, 2)}\n`, 'utf8');

        const frameCount = Object.keys(atlas.frames).length;
        console.log(
            `[input-prompts] ${profile.key}: ${frameCount} frames -> ${path.relative(projectRoot, targetJsonPath)}`
        );
    }
};

run();
