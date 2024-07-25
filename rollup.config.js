import typescript from '@rollup/plugin-typescript';

export default {
	input: 'src/main.ts',
	output: {
		file: 'dist/font.js',
		format: 'es',
		sourcemap: true,
	},
	plugins: [typescript({
		compilerOptions: {
			target: "ESNext",
			lib: [
				"DOM",
				"ESNext",
			],
			sourceMap: true,
		}
	})],
};