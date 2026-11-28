import { Container } from '#rendering/Container';

/**
 * The node a JSX fragment (`<>...</>`) produces. An element that receives a
 * fragment as a child adopts the fragment's children in its place, so a
 * fragment never adds a level to the hierarchy it is placed into. A fragment
 * used at the top level stays a plain {@link Container} holding its children.
 */
export class JsxFragment extends Container {}
