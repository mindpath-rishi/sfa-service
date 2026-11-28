import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Logger, Provider } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger('Firebase');

export const NotificationProvider: Provider = {
  provide: 'NOTIFICATION_CLIENT',
  useFactory: () => {
    const existingApp = getApps().find((app) => app.name === '[DEFAULT]');

    if (existingApp) {
      logger.log(`Using existing Firebase app: ${existingApp.name}`);
      return existingApp;
    }

    const filePath = path.resolve(process.cwd(), 'firebase-admin.json');

    if (!fs.existsSync(filePath)) {
      throw new Error(`firebase-admin.json not found at: ${filePath}`);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    try {
      const app = initializeApp({
        credential: cert(serviceAccount),
      });

      // Project id only: key ids and client emails are credentials metadata
      // and must not end up in log storage.
      logger.log(
        `Firebase initialized (project: ${serviceAccount.project_id})`,
      );

      return app;
    } catch (error) {
      logger.error(
        'Firebase initialization failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  },
};
