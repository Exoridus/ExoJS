// Declaration bridge for the one dependency the tooling imports that ships no
// types of its own.
//
// `eslint-plugin-security` publishes plain JavaScript with no declarations, so
// without this the ESLint config would not resolve it at all. This is a
// shorthand ambient declaration, so everything imported from it is `any` -
// stating that keeps `noImplicitAny` on for everything else in
// `tsconfig.scripts.json`, where a genuinely missing annotation is an error
// rather than silent.
//
// `@codexo/exojs-config` used to be listed here as well. It is now part of the
// program (`allowJs` + `checkJs`), so its JSDoc types reach every consumer.

declare module 'eslint-plugin-security';
