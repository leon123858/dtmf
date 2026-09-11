import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig(config, {
	testMatch: 'record-list.spec.ts',
	use: { locale: 'en-US', timezoneId: 'Asia/Taipei' },
	outputDir: 'test-results/record-list',
});
