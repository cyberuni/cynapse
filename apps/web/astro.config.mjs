import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/cynapse',
	// Pages that moved. GitHub Pages has no server-side redirects, so Astro writes a page at
	// the old path that forwards to the new one.
	redirects: {
		'/getting-started/introduction': '/cynapse/what-is/',
	},
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
				{ label: 'What is cynapse', slug: 'what-is' },
				{ label: 'Quick start', slug: 'getting-started/quick-start' },
				{
					label: 'Design',
					items: [
						{ label: 'How it fits together', slug: 'design' },
						{ label: 'What cynapse stores', slug: 'design/scope' },
						{
							label: 'cynapse and the runtime',
							slug: 'design/runtime',
							badge: { text: 'Proposed', variant: 'caution' },
						},
						{ label: 'Status', slug: 'design/status' },
						{ label: 'Decisions', slug: 'design/decisions' },
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
						{
							label: 'Subjects across stores',
							slug: 'concepts/subjects',
							badge: { text: 'Planned', variant: 'note' },
						},
						{
							label: 'Messaging',
							slug: 'concepts/messaging',
							badge: { text: 'Proposed', variant: 'caution' },
						},
						{ label: 'Storage', slug: 'concepts/storage' },
						{ label: 'Agent-friendly output', slug: 'concepts/agent-friendly-output' },
					],
				},
				{
					label: 'CLI Reference',
					items: [
						{ label: 'Overview', slug: 'cli' },
						{ label: 'channel', slug: 'cli/channel' },
						{ label: 'entry', slug: 'cli/entry' },
						{ label: 'read / unread / changes', slug: 'cli/read' },
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
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cynapse/edit/main/apps/web/',
			},
		}),
	],
})
