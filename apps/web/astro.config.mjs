import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/cynapse',
	integrations: [
		starlight({
			title: 'cynapse',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/cyberuni/cynapse',
				},
			],
			sidebar: [
				{ label: 'What is cynapse', link: '/what-is-cynapse/' },
				{ label: 'Getting Started', link: '/getting-started/' },
				{
					label: 'CLI',
					items: [{ autogenerate: { directory: 'cli' } }],
				},
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cynapse/edit/main/apps/web/',
			},
		}),
	],
})
