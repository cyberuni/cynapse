import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/cynapse',
	integrations: [
		starlight({
			title: 'cynapse',
			// The cyber-* family mark: the shared command reticle around a per-package glyph
			// (cyberuni/cyber-mux docs/design/icon-system.md). The favicon self-themes; the header
			// logo ships as a light/dark pair because Starlight picks its theme by `data-theme`,
			// which `prefers-color-scheme` never sees.
			favicon: '/img/logo.svg',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				alt: 'cynapse',
			},
			customCss: ['./src/styles/global.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/cyberuni/cynapse',
				},
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Quick start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'Channels', slug: 'concepts/channels' },
						{ label: 'Entries', slug: 'concepts/entries' },
						{ label: 'Participants', slug: 'concepts/participants' },
						{ label: 'Read state', slug: 'concepts/read-state' },
						{ label: 'Types, tags and traits', slug: 'concepts/types-tags-traits' },
						{ label: 'State and lifecycle', slug: 'concepts/state-and-lifecycle' },
						{ label: 'Views', slug: 'concepts/views' },
						{ label: 'Storage', slug: 'concepts/storage' },
						{ label: 'Agent-friendly output', slug: 'concepts/agent-friendly-output' },
						{ label: 'Subjects across stores', slug: 'concepts/subjects' },
					],
				},
				{
					label: 'CLI Reference',
					items: [
						{ label: 'Overview', slug: 'cli' },
						{ label: 'channel', slug: 'cli/channel' },
						{ label: 'entry', slug: 'cli/entry' },
						{ label: 'read / unread', slug: 'cli/read' },
						{ label: 'tag', slug: 'cli/tag' },
						{ label: 'state', slug: 'cli/state' },
						{ label: 'gui', slug: 'cli/gui' },
						{ label: 'dev', slug: 'cli/dev' },
					],
				},
				{
					label: 'Library API',
					items: [
						{ label: 'Overview', slug: 'api' },
						{ label: 'Store', slug: 'api/store' },
						{ label: 'Types', slug: 'api/types' },
						{ label: 'Refs', slug: 'api/refs' },
						{ label: 'Ids and errors', slug: 'api/ids' },
					],
				},
				{ label: 'Design decisions', slug: 'design/decisions' },
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cynapse/edit/main/apps/web/',
			},
		}),
	],
})
