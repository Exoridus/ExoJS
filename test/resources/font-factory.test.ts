import { FontFactory } from '@/resources/factories/FontFactory';

describe('FontFactory', () => {
    test('rejects clearly when font data is too short', async () => {
        const factory = new FontFactory();

        await expect(factory.create(new ArrayBuffer(3), {
            family: 'TestFont',
        })).rejects.toThrow('expected at least 4 bytes');
    });
});
