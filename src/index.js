/* eslint-disable no-console */
const fs = require('fs');
const modulePath = require('path');

const rootPath = process.cwd();

// eslint-disable-next-line no-unused-vars
const wrapPath = (_path) => {
	const sepStart = new RegExp(`^${modulePath.sep}`);
	const sepEnd = new RegExp(`${modulePath.sep}$`);
	return (sepStart.test(_path) ? '' : modulePath.sep) + _path + (sepEnd.test(_path) ? '' : modulePath.sep);
};

module.exports = (babel) => {
	const { types } = babel;
	return {
		visitor: {
			// Here the magic start
			// This method is called every time the lexical analizer
			// find a call expression like 'foo()' in this case
			// we need to look for 'requireAll()'
			CallExpression(path, state) {
				// Skip all other calls that not equals to 'requireAll'
				if (path.node.callee.name !== 'requireAll') return;
				// 'ignorePath' will be used for remove unuse path
				// for instance the cwd path in a react native project
				// is '../projectRootPath/node_modules/react-native'
				// '/node_modules/react-native' is trash for this plugin
				// because we need files from '../projectRootPath/'
				// for this reason we need to ignore '/node_modules/react-native'
				const { ignorePath = '' } = state.opts;
				const { filename } = state.file.opts;
				let { filenameRelative } = state.file.opts;

				// in some cases state.files.opts comes with two
				// values 'filename' and 'filenameRelative'
				// in other situations only comes with just one prop.
				if (!filenameRelative) {
					filenameRelative = filename.replace(rootPath, '');
				}

				// This is the path where 'requireAll' was found
				const excutionPath = modulePath.dirname(filenameRelative);

				// Here we extract the path pased to 'requireAll' function
				// in case this var comes undefined (means no arguments were pased)
				// the default path to read is 'excutionPath'
				const [{ value: rawPathToRead = './' } = {}] = path.node.arguments;

				const pathToRead = wrapPath(rawPathToRead);

				// The absolute path for the files we're going to read
				let absolutePath = modulePath.join(rootPath, excutionPath, pathToRead);

				// If 'ignorePath' is defined we substract it
				if (ignorePath != null && ignorePath !== '') {
					absolutePath = absolutePath
						.split(wrapPath(ignorePath))
						.join(modulePath.sep);
				}

				if (!fs.existsSync(absolutePath)) throw path.buildCodeFrameError(`Path \`${pathToRead}\` doesn't exist`);

				// At this point we need to replace the callExpression
				// for an objectExpression
				// for example:
				// replace this:
				// const modules = requireAll('./modules') // ./modules/1.js - ./modules/2.js
				// with:
				// const modules = { 1: contentOfTheModule, 2... };
				path.replaceWith(types.objectExpression(
					fs
						.readdirSync(absolutePath)
						.map((file) => {
							const fileRelative = `${pathToRead}${file}`;
							let [name] = fileRelative.split(modulePath.sep).reverse();
							[name] = name.split('.');
							return types.objectProperty(
								types.identifier(name),
								types.callExpression(
									types.identifier('require'),
									[types.stringLiteral(fileRelative)],
								),
							);
						}),
				));
			},
		},
	};
};
