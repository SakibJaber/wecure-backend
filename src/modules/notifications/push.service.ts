import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/modules/users/schemas/user.schema';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private firebaseService: FirebaseService,
  ) {}

  /**
   * Sends a push notification to a user's registered devices.
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

      // Prepare text values for data payload as FCM data requires string values
      const stringifiedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        stringifiedData[key] = String(value);
      }

      const message = {
        notification: { title, body },
        data: stringifiedData,
        tokens: user.fcmTokens,
      };

      const response =
        await this.firebaseService.messaging.sendEachForMulticast(message);

      this.logger.log(
        `Successfully sent ${response.successCount} messages to user ${userId}`,
      );
      if (response.failureCount > 0) {
        this.logger.warn(
          `Failed to send ${response.failureCount} messages to user ${userId}`,
        );

        // Handle invalid tokens
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-argument'
            ) {
              failedTokens.push(user.fcmTokens[idx]);
            }
          }
        });

        if (failedTokens.length > 0) {
          // Remove invalid tokens from user
          await this.userModel.findByIdAndUpdate(userId, {
            $pull: { fcmTokens: { $in: failedTokens } },
          });
          this.logger.log(
            `Removed ${failedTokens.length} invalid FCM tokens for user ${userId}`,
          );
        }
      }
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
