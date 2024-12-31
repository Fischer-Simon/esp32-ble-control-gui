const path = require('path');
const { InjectManifest } = require('workbox-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.[contenthash].js',
        publicPath: '/'
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'sass-loader']
            },
            {
                test: /\.(svg|png)$/,
                use: ['file-loader']
            },
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyPlugin({
            patterns: [
                { from: '*.png', context: 'public' },
                { from: '*.json', context: 'public' },
                // { from: '*.ico', context: 'public' },
                { from: '*.wasm', context: 'public' },
            ],
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',  // Adjust the path if needed
            filename: 'index.html'
        }),
        new InjectManifest({
            swSrc: './src/workbox.ts',
            swDest: 'service-worker.js',
            exclude: [
                /\.LICENSE\./,
                /\.map$/,
            ]
        })
    ],
};