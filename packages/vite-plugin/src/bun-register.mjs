// Bun's native plugin API supplies the same `.sim` modules as Node's module hooks.
import { plugin } from 'bun';
import { compileSim, moduleSource } from './index.ts';

plugin({
  name: 'simulant',
  setup(build) {
    build.onLoad({ filter: /\.sim$/ }, ({ path }) => {
      const { module, files } = compileSim(path);
      return { loader: 'js', contents: moduleSource(module, { file: path, files }) };
    });
  },
});
