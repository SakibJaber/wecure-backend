import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private emailTemplate: string;

  constructor(private config: ConfigService) {
    this.emailTemplate = this.compileEmailTemplate();

    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_HOST'),
      port: +(config.get<number>('MAIL_PORT') ?? 465),
      secure: true,
      auth: {
        user: config.get('MAIL_USER'),
        pass: config.get('MAIL_PASS'),
      },
      // Conservative settings for better reliability
      pool: true,
      maxConnections: 10, // Reduced for stability
      maxMessages: 50,
      rateDelta: 2000, // Increased to 2 seconds
      rateLimit: 10, // Reduced rate limit
      socketTimeout: 15000,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      dnsTimeout: 10000,
    });

    this.verifyTransporter();
  }

  private compileEmailTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>RNA Supplies Newsletter</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c5aa0; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-top: none; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>RNA Supplies Newsletter</h1>
    </div>
    <div class="content">
        {{CONTENT}}
    </div>
    <div class="footer">
        <p>&copy; ${new Date().getFullYear()} RNA Supplies. All rights reserved.</p>
        <p><a href="{{UNSUBSCRIBE_LINK}}">Unsubscribe</a></p>
    </div>
</body>
</html>`;
  }

  private async verifyTransporter() {
    try {
      await this.transporter.verify();
      // console.log('✓ Mail transporter verified and ready');
    } catch (error) {
      this.logger.error('✗ Mail transporter verification failed:', error);
    }
  }

  async sendEmail(to: string, subject: string, text: string) {
    try {
      const html = this.emailTemplate.replace(
        '{{CONTENT}}',
        text
          .replace(/\n/g, '<br>')
          .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>'),
      );

      const mailOptions = {
        from: this.config.get('MAIL_FROM'),
        to,
        subject,
        text,
        html,
        // Add headers to help with deliverability
        headers: {
          'X-Priority': '3',
          'X-Mailer': 'RNA Supplies Newsletter System',
        },
      };

      const result = await this.transporter.sendMail(mailOptions);

      // Log success for monitoring
      this.logger.log(`✓ Email sent to ${to}: ${result.messageId}`);

      return result;
    } catch (error) {
      // Enhanced error logging
      this.logger.error(`✗ Failed to send email to ${to}:`, {
        error: error.message,
        code: error.code,
        responseCode: error.responseCode,
        response: error.response,
      });

      // Re-throw with more context
      throw new InternalServerErrorException(
        `Failed to send email to ${to}: ${error.message}`,
      );
    }
  }

  async sendResetPasswordOtp(email: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to: email,
        subject: 'Your Password Reset OTP',
        text: `Your password reset OTP is: ${code}\n\nIt expires in ${this.config.get('OTP_TTL_MINUTES')} minutes.`,
      });
    } catch (err) {
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  async sendEmailVerificationOtp(email: string, code: string) {
    try {
      const minutes = this.config.get<string>('OTP_EXPIRATION_MINUTES') ?? '15';
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to: email,
        subject: 'Verify your email',
        text: `Your verification code is: ${code}\n\nIt expires in ${minutes} minutes.`,
      });
    } catch (err) {
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  // Method to close transporter (useful for graceful shutdown)
  async close() {
    if (this.transporter) {
      this.transporter.close();
    }
  }
}
