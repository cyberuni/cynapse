import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/cynet',
	integrations: [
		starlight({
			title: 'cynet',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/cyberuni/cynet',
				},
			],
			sidebar: [
				{ label: 'What is cynet', link: '/what-is-cynet/' },
				{ label: 'Getting Started', link: '/getting-started/' },
				{
					label: 'CLI',
					items: [{ autogenerate: { directory: 'cli' } }],
				},
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cynet/edit/main/apps/web/',
			},
		}),
	],
})
