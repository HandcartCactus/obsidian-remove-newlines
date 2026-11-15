module.exports = {
    verbose: true,
    preset: 'ts-jest',
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    moduleFileExtensions: ['js', 'ts'],
    // Root-level modules ("utils", "detector") resolve like in the esbuild bundle.
    moduleDirectories: ['node_modules', '<rootDir>'],
};
