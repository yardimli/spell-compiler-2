const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	entry: './main.js',
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, 'dist'),
		clean: true
	},
	resolve: {
		extensions: ['.js']
	},
	module: {
		rules: []
	},
	plugins: [
		// Injects bundle.js into index.html
		new HtmlWebpackPlugin({
			template: './index.html',
			inject: 'body'
		}),
		new CopyWebpackPlugin({
			patterns: [
				// Copy the assets folder (fonts, environments)
				{ from: 'assets', to: 'assets' },
				// Copy Havok WASM from node_modules to the root of dist
				{
					from: 'node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm',
					to: 'HavokPhysics.wasm'
				}
			]
		})
	],
	devServer: {
		static: './dist',
		hot: true,
		open: true
	},
	mode: 'development'
};
