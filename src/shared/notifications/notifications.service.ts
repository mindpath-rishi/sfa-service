import { Inject, Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { AppLogger } from 'src/core/logger/app-logger';

interface PushResult {
  total: number;
  success: number;
  failed: number;
  results?: {
    token?: string;
    success: boolean;
    error?: string;
  }[];
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject('NOTIFICATION_CLIENT')
    private readonly app: admin.app.App,
  ) {}

  private messaging() {
    return admin.messaging(this.app);
  }

  /* ======================================================
   * SINGLE DEVICE
   * ====================================================== */

  async sendToRecipient(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<PushResult> {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: { title, body },
        data,
      };

      await this.messaging().send(message);

      return {
        total: 1,
        success: 1,
        failed: 0,
      };
    } catch (err) {
      AppLogger.error('Push failed (single)', err);

      return {
        total: 1,
        success: 0,
        failed: 1,
        results: [
          {
            token,
            success: false,
            error: err.message,
          },
        ],
      };
    }
  }

  /* ======================================================
   * MULTIPLE DEVICES
   * ====================================================== */

  async sendToMultiple(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<PushResult> {
    if (!tokens.length) {
      return { total: 0, success: 0, failed: 0 };
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      data,
    };

    const response = await this.messaging().sendEachForMulticast(message);

    const results = response.responses.map((r, i) => ({
      token: tokens[i],
      success: r.success,
      error: r.error?.message,
    }));

    // Log failed tokens
    results
      .filter((r) => !r.success)
      .forEach((r) =>
        AppLogger.warn(`Push failed for token ${r.token}: ${r.error}`),
      );

    return {
      total: tokens.length,
      success: response.successCount,
      failed: response.failureCount,
      results,
    };
  }

  /* ======================================================
   * TOPIC
   * ====================================================== */

  async sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<PushResult> {
    try {
      await this.messaging().send({
        topic,
        notification: { title, body },
        data,
      });

      return {
        total: 1,
        success: 1,
        failed: 0,
      };
    } catch (err) {
      AppLogger.error('Push failed (topic)', err);

      return {
        total: 1,
        success: 0,
        failed: 1,
      };
    }
  }
}
