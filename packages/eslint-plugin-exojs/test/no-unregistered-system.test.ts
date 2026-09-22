import { RuleTester } from 'eslint';

import { noUnregisteredSystem } from '../src/rules/no-unregistered-system.ts';

// RuleTester registers its own `describe`/`it` blocks (via the vitest globals
// this project enables) - it must run at the top level, not nested inside
// another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-unregistered-system', noUnregisteredSystem, {
  valid: [
    // Registered through the scheduler.
    'const physics = new PhysicsSystem();\napp.systems.add(physics);',
    'const physics = new PhysicsSystem();\nthis.systems.add(physics);',
    'const physics = new PhysicsSystem();\nphysics.gravity = 10;\nsystems.add(physics);',
    // Driven by hand, which is registration of a different kind.
    'const physics = new PhysicsSystem();\nphysics.update(delta);',
    'const physics = new PhysicsSystem();\nfor (const step of steps) physics.fixedUpdate(step);',
    // Leaves the file, so registration may happen where this rule cannot see.
    'export const physics = new PhysicsSystem();',
    'function make() { const physics = new PhysicsSystem(); return physics; }',
    'const physics = new PhysicsSystem();\nregister(physics);',
    'const physics = new PhysicsSystem();\nconst bundle = { physics };',
    'const physics = new PhysicsSystem();\nconst all = [physics];',
    'const physics = new PhysicsSystem();\nthis.physics = physics;',
    'const physics = new PhysicsSystem();\nexport default physics;',
    // Not system-shaped by name.
    'const cache = new TextureCache();',
    // Not bound to a name at all: registered inline.
    'app.systems.add(new PhysicsSystem());',
    // Destructuring is not a plain binding this rule tracks.
    'const [physics] = [new PhysicsSystem()];',
    // Handed to something other than the registry: the binding has left this
    // file's control, so whether it ends up registered is not visible here.
    'const physics = new PhysicsSystem();\nlayers.add(physics);',
    'const physics = new PhysicsSystem();\nsystems.push(physics);',
    // A configured registry.
    { code: 'const physics = new PhysicsSystem();\nworld.add(physics);', options: [{ registry: 'world' }] },
    // A configured phase set.
    { code: 'const physics = new PhysicsSystem();\nphysics.step(delta);', options: [{ lifecycleMethods: ['step'] }] },
  ],
  invalid: [
    {
      code: 'const physics = new PhysicsSystem();',
      errors: [{ messageId: 'unregistered', data: { name: 'PhysicsSystem', registry: 'systems', registerMethod: 'add' } }],
    },
    // Configured but never handed anywhere: the case the rule exists for.
    {
      code: 'const physics = new PhysicsSystem();\nphysics.gravity = 10;\nphysics.enabled = true;',
      errors: [{ messageId: 'unregistered', data: { name: 'PhysicsSystem', registry: 'systems', registerMethod: 'add' } }],
    },
    // A non-phase method call is still not registration.
    {
      code: 'const physics = new PhysicsSystem();\nphysics.configure({ gravity: 10 });',
      errors: [{ messageId: 'unregistered' }],
    },
    // Inside a function body, never handed out.
    {
      code: 'function setup() { const physics = new PhysicsSystem(); physics.gravity = 10; }',
      errors: [{ messageId: 'unregistered' }],
    },
    // Registration written above the declaration is still found: the analysis
    // runs once the whole file is parsed, not in source order.
    {
      code: 'const audio = new AudioSystem();\nconst physics = new PhysicsSystem();\nsystems.add(audio);',
      errors: [{ messageId: 'unregistered', data: { name: 'PhysicsSystem', registry: 'systems', registerMethod: 'add' } }],
    },
    // A configured name pattern.
    {
      code: 'const runner = new ParticleDriver();',
      options: [{ pattern: 'Driver$' }],
      errors: [{ messageId: 'unregistered', data: { name: 'ParticleDriver', registry: 'systems', registerMethod: 'add' } }],
    },
    // A phase call outside the configured set does not count as driving it.
    {
      code: 'const physics = new PhysicsSystem();\nphysics.update(delta);',
      options: [{ lifecycleMethods: ['step'] }],
      errors: [{ messageId: 'unregistered' }],
    },
  ],
});
