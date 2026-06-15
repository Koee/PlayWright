import { test } from '@playwright/test';
import { runProjectCopyStages } from '../../../steps/copy.steps';
import { QR_READY_TIMEOUT_MS } from '../../../config/test.config';

test.describe('Project Copy Stages - All Websites', () => {
    test.setTimeout(QR_READY_TIMEOUT_MS * 6);

    test('should copy project content across order stages for each configured tab @copy @copy-stages @slow', async ({ page }, testInfo) => {
        await runProjectCopyStages(page, testInfo);
    });
});
