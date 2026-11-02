# Which liquid?

Standalone GitHub Pages build of the phase-diagram applet from [physics_demos](https://github.com/MartinAlvarezSergio/physics_demos).

Live: https://martinalvarezsergio.github.io/which_liquid_playground/

Phase diagrams for water, methane, ethane, carbon dioxide and nitrogen, with the surface
conditions of Earth, Venus, Mars, Titan, Europa and an imagined rogue planet marked on them. The
readouts list which substances would be solid, liquid, gas or supercritical at each world's surface.
Click anywhere on the chart to drop your own world, or compare all five substances at once.

```bash
npm install
npm run dev
npm run deploy   # build + publish gh-pages
```

The applet code is synchronized from `physics_demos/src/applets/which_liquid`.
Publish source changes on `main`, then run `npm run deploy` to update GitHub Pages.
