import { ActionMap, ButtonAction, type Container, type InputBinding, Keyboard } from '../../src/index';

declare const binding: InputBinding;
declare const container: Container;

const actions = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
for (const action of actions) void action;
for (const child of container) void child;

using ownedBinding = binding;
void ownedBinding.active;
