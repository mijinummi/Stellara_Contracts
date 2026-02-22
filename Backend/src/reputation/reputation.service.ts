import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/auth/entities/user.entity';
import { ReputationLog } from './entities/reputation-log.entity';
import { Repository } from 'typeorm';
import {
  levelFromXp,
  rankFromReputation,
  REPUTATION_POINTS,
  ReputationAction,
  XP_POINTS,
} from './types/reputation.types';
import { CreateReputationDto } from './dto/create-reputation.dto';
import { UpdateReputationDto } from './dto/update-reputation.dto';

@Injectable()
export class ReputationService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(ReputationLog) private logRepo: Repository<ReputationLog>,
  ) {}

  async create(createReputationDto: CreateReputationDto) {
    // Implementation for creating reputation record
    return { message: 'Create not implemented' };
  }

  async findAll() {
    // Implementation for finding all reputation records
    return { message: 'FindAll not implemented' };
  }

  async findOne(id: number) {
    // Implementation for finding one reputation record
    return { message: 'FindOne not implemented' };
  }

  async update(id: number, updateReputationDto: UpdateReputationDto) {
    // Implementation for updating reputation record
    return { message: 'Update not implemented' };
  }

  async remove(id: number) {
    // Implementation for removing reputation record
    return { message: 'Remove not implemented' };
  }

  async applyAction(userId: string, action: ReputationAction) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const repChange = REPUTATION_POINTS[action] ?? 0;
    const xpChange = XP_POINTS[action] ?? 0;

    user.reputation += repChange;
    user.totalXp += xpChange;

    // Update level
    const newLevel = levelFromXp(user.totalXp);
    user.level = newLevel;

    // Update rank
    user.rank = rankFromReputation(user.reputation);

    await this.userRepo.save(user);

    await this.logRepo.save({
      user,
      action,
      reputationChange: repChange,
      xpChange,
    });

    return user;
  }
}
