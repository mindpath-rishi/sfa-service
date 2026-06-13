import * as admin from 'firebase-admin';
import { Provider } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

export const NotificationProvider: Provider = {
  provide: 'NOTIFICATION_CLIENT',
  useFactory: () => {
    console.log('================ Firebase Init ================');

    const existingApp = admin.apps.find(
      (app): app is admin.app.App => app?.name === '[DEFAULT]',
    );

    if (existingApp) {
      console.log('Using existing Firebase app:', existingApp.name);
      return existingApp;
    }

    console.log('Current Working Directory:', process.cwd());
    console.log('Current __dirname:', __dirname);

    const filePath = path.resolve(process.cwd(), 'firebase-admin.json');

    console.log('Firebase Config Path:', filePath);
    console.log('File Exists:', fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      throw new Error(`firebase-admin.json not found at: ${filePath}`);
    }

    const serviceAccount = require(filePath);

    console.log('Project ID:', serviceAccount.project_id);
    console.log('Client Email:', serviceAccount.client_email);
    console.log('Private Key ID:', serviceAccount.private_key_id);
    console.log(
      'Private Key Present:',
      !!serviceAccount.private_key,
    );

    try {
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log('Firebase initialized successfully');
      console.log('Firebase App Name:', app.name);

      return app;
    } catch (error) {
      console.error('Firebase initialization failed');
      console.error(error);
      throw error;
    } finally {
      console.log('================================================');
    }
  },
};