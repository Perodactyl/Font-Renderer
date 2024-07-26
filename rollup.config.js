import typescript from '@rollup/plugin-typescript';
// import terser from '@rollup/plugin-terser';

export default {
	input: 'src/main.ts',
	output: {
		file: 'dist/font.js',
		format: 'es',
		sourcemap: true,
	},
	plugins: [
		typescript(),
		// nodeResolve(),
		// commonjs(),
		// terser({
		// 	mangle: true,
		// 	format: {
		// 		comments: false,
		// 	}
		// }),
	],
};