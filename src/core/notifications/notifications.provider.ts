import * as admin from 'firebase-admin';
import { Provider } from '@nestjs/common';
import * as path from 'path';

export const NotificationProvider: Provider = {
  provide: 'NOTIFICATION_CLIENT',
  useFactory: () => {
    const existingApp = admin.apps.find(
      (app): app is admin.app.App => app?.name === '[DEFAULT]',
    );

    if (existingApp) {
      return existingApp;
    }

    const filePath = path.resolve(process.cwd(), 'firebase-admin.json');

    console.log(filePath);

    const serviceAccount = require(filePath);

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  },
};
