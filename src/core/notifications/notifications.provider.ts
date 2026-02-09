import * as admin from 'firebase-admin';
import { Provider } from '@nestjs/common';
import * as path from 'path';

export const NotificationProvider: Provider = {
  provide: 'NOTIFICATION_CLIENT',
  useFactory: () => {
    const serviceAccount = require(
      path.join(__dirname, '../../../firebase-admin.json'),
    );

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  },
};
