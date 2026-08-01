import type { Container, InputBinding } from '../../src/index';

declare const binding: InputBinding;
declare const container: Container;

for (const child of container) void child;

using ownedBinding = binding;
void ownedBinding.active;
