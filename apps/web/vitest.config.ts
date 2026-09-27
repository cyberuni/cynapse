import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		// No interactive components have landed yet, so there is nothing under
		// src/**/*.test.ts. Remove this once the first one ships with a test file.
		passWithNoTests: true,
	},
})
