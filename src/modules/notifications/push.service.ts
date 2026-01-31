import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/modules/users/schemas/user.schema';


@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  /**
   * Sends a push notification to a user's registered devices.
   * Currently logs to console; integrate Firebase Admin SDK here.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<void> {
    try {
      const user = await this.userModel
        .findById(userId)
        .select('fcmTokens')
        .lean();

      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
        this.logger.debug(`No FCM tokens for user ${userId}, skipping push`);
        return;
      }

      // TODO: Replace with Firebase Admin SDK
      // Example:
      // const message = {
      //   notification: { title, body },
      //   data,
      //   tokens: user.fcmTokens,
      // };
      // await admin.messaging().sendEachForMulticast(message);

      this.logger.log(
        `[PUSH STUB] Would send to user ${userId}: "${title}" - "${body}"`,
      );
      this.logger.debug(`[PUSH STUB] Tokens: ${user.fcmTokens.join(', ')}`);
      this.logger.debug(`[PUSH STUB] Data: ${JSON.stringify(data)}`);
    } catch (error) {
      this.logger.error(`Failed to send push to user ${userId}`, error);
    }
  }

  /**
   * Sends a push notification to multiple users.
   */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<void> {
    await Promise.all(
      userIds.map((userId) => this.sendToUser(userId, title, body, data)),
    );
  }
}
