import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async create(data: {
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
  }) {
    return this.auditLogModel.create({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress,
    });
  }

  async findAll(filters: {
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    const query: any = {};

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) {
        query.createdAt.$gte = new Date(filters.from);
      }
      if (filters.to) {
        query.createdAt.$lte = new Date(filters.to);
      }
    }

    const skip = (filters.page - 1) * filters.limit;

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }
}
