// Core modules
const { writeFileSync } = require('fs')
const path = require('path')
const url = require('url')
const { promisify } = require('util')
const webpack = require('webpack')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const getConfig = require('../get-config')
const LogPlugin = require('./plugins/log')

const rimrafAsync = promisify(rimraf)
const mkdirpAsync = promisify(mkdirp)

module.exports = async function() {
  const env = process.env.NODE_ENV || 'development'
  const isDev = env === 'development'

  const { configFile, projectRoot, outputPath } = await getConfig()

  await rimrafAsync(outputPath)
  await mkdirpAsync(outputPath)

  let themeConfig = {}
  try {
    themeConfig = require(configFile)
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.error(err)
    }
  }

  let host = themeConfig.host || 'http://localhost:9000/'
  const parsedUrl = url.parse(host)
  host = url.format(parsedUrl)
  const port = parsedUrl.port || 8080
  const entry = {}
  const plugins = [
    new LogPlugin(),
    new webpack.DefinePlugin({
      'process.env': { NODE_ENV: JSON.stringify(env) }
    })
  ]

  writeFileSync(path.join(outputPath, 'host.txt'), host)

  if (isDev) {
    plugins.push(
      new webpack.NoEmitOnErrorsPlugin(),
      new webpack.HotModuleReplacementPlugin(),
      new webpack.NamedModulesPlugin()
    )
  }

  const extractSass = new ExtractTextPlugin({
    filename: '[name].css',
    disable: isDev
  })

  let config = {
    context: projectRoot,
    entry,
    resolve: {
      modules: [path.join(__dirname, '../../node_modules'), 'node_modules']
    },
    resolveLoader: {
      modules: [path.join(__dirname, '../../node_modules'), 'node_modules']
    },
    output: {
      path: outputPath,
      filename: '[name].js',
      publicPath: isDev ? host : '../'
    },
    devtool: isDev ? 'eval-source-map' : false,
    module: {
      rules: [
        {
          test: /\.scss$/,
          loader: extractSass.extract({
            use: [
              {
                loader: 'css-loader',
                options: {
                  minimize: !isDev,
                  sourceMap: isDev
                }
              },
              {
                loader: 'postcss-loader',
                options: {
                  sourceMap: isDev ? 'inline' : false,
                  plugins: loader => {
                    const defaultPlugins = () => [
                      require('autoprefixer')({
                        browsers: ['last 2 versions', 'IE 11']
                      }),
                      require('lost'),
                      require('postcss-custom-media'),
                      require('postcss-zindex'),
                      require('postcss-discard-duplicates'),
                      require('postcss-unique-selectors')
                    ]

                    // Allow custom PostCSS configuration
                    if (themeConfig.postCss) {
                      return themeConfig.postCss(loader, defaultPlugins)
                    }

                    return defaultPlugins()
                  }
                }
              },
              {
                loader: 'sass-loader',
                options: {
                  sourceMap: isDev
                }
              }
            ],
            // Use style-loader in development
            fallback: {
              loader: 'style-loader',
              options: {
                sourceMap: isDev,
                importLoaders: 1
              }
            }
          })
        },
        {
          test: /\.(jpg|png|gif)$/,
          loader: 'file-loader',
          options: {
            name: 'images/[name].[ext]'
          }
        },
        {
          test: /\.svg$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: 'svg/[name].[ext]'
              }
            },
            {
              loader: 'svgo-loader',
              options: {
                plugins: [
                  { removeTitle: true },
                  { removeUselessDefs: false },
                  { convertPathData: false }
                ]
              }
            }
          ]
        },
        {
          test: /\.(ttf|woff2?|eot|otf)$/,
          loader: 'file-loader',
          options: {
            name: 'fonts/[name].[ext]'
          }
        },
        {
          test: /\.js$/,
          exclude: /(node_modules)/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [
                [
                  require.resolve('babel-preset-env'),
                  {
                    modules: false
                  }
                ],
                'react'
              ],
              plugins: [
                'react-require',
                'transform-object-rest-spread',
                'transform-class-properties',
                'transform-runtime',
                'styled-jsx/babel'
              ]
            }
          }
        }
      ]
    },
    plugins: [...plugins, extractSass],
    stats: {
      colors: true
    }
  }

  let devServer = {
    host: parsedUrl.hostname,
    port,
    https: parsedUrl.protocol === 'https:',
    contentBase: outputPath,
    compress: true,
    hot: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    quiet: true,
    stats: {
      colors: true
    }
  }

  if (typeof themeConfig.decorateConfig === 'function') {
    config = await themeConfig.decorateConfig(config, {
      webpack,
      host,
      projectRoot
    })
  }

  if (typeof themeConfig.decorateDevConfig === 'function') {
    devServer = await themeConfig.decorateDevConfig(devServer, {
      webpack,
      host,
      projectRoot
    })
  }

  return [config, devServer]
}