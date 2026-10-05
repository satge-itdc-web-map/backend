import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { RegisterDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

 async register(registerDto: RegisterDto) {
  const { email, password, role, username } = registerDto;

  const existingUser = await this.userRepository.findOne({ where: { email } });
  if (existingUser) {
    throw new ConflictException('Email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = this.userRepository.create({
    email,
    password: hashedPassword,
    role,
    // username: username || null,
    username: username || undefined,
  });

  await this.userRepository.save(user);

  const payload = { email: user.email, sub: user.id, role: user.role };
  const token = this.jwtService.sign(payload);

  return {
    access_token: token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      username: user.username,
      avatar: user.avatar,
    },
  };
}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Trouver l'utilisateur
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Générer le JWT
    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
  access_token: token,
  user: {
    id: user.id,
    email: user.email,
    role: user.role,
    username: user.username,
    avatar: user.avatar,
  },
}};

  async validateUser(userId: number) {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async updateProfile(userId: number, data: { username?: string; avatar?: string; password?: string }) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (data.username) user.username = data.username;
    if (data.avatar) user.avatar = data.avatar;
    if (data.password) user.password = await bcrypt.hash(data.password, 10);
    await this.userRepository.save(user);
    return { id: user.id, email: user.email, username: user.username, avatar: user.avatar, role: user.role };
  }

  async getProfile(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'username', 'avatar', 'role', 'createdAt'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getAllUsers() {
    return this.userRepository.find({
      select: ['id', 'email', 'role', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateUser(id: number, data: { email?: string; role?: string }) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    Object.assign(user, data);
    return this.userRepository.save(user);
  }

  async deleteUser(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepository.remove(user);
    return { message: 'User deleted' };
  }
}
