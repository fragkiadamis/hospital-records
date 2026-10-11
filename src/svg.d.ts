// angular.json loads .svg files as text ("loader"), so importing one gives its markup.
declare module '*.svg' {
  const markup: string;
  export default markup;
}
