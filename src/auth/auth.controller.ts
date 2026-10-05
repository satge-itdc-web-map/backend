import { Controller, Post, Body, Get, Patch, Delete, UseGuards, Request, Param, ParseIntPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req, @Body() body: { username?: string; avatar?: string; password?: string }) {
    return this.authService.updateProfile(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users')
  getAllUsers() {
    return this.authService.getAllUsers();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('users/:id')
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() body: { email?: string; role?: string }) {
    return this.authService.updateUser(id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('users/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.authService.deleteUser(id);
  }
}
