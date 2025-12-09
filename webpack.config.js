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
		// LEAVE THIS EMPTY or only keep rules for things that are NOT CSS/HTML
		rules: [
			// Do NOT put a css-loader or style-loader rule here.
			// Do NOT put an html-loader rule here.
		]
	},
	plugins: [
		new HtmlWebpackPlugin({
			template: './index.html',
			inject: 'body' // Injects only the bundle.js script
		}),
		new CopyWebpackPlugin({
			patterns: [
				// 1. Copy the assets folder
				{ from: 'assets', to: 'assets' },
				// 2. Copy Havok WASM
				{
					from: 'node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm',
					to: 'HavokPhysics.wasm'
				},
				// 3. COPY YOUR CSS FILE AS-IS
				// This takes index.css from your root and puts a copy in dist/
				{ from: 'index.css', to: 'index.css' }
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
