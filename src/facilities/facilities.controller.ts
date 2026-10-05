import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FacilitiesService } from './facilities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { Multer } from 'multer';
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get()
  findAll() {
    return this.facilitiesService.findAll();
  }

  @Get('geojson')
  findAsGeoJson() {
    return this.facilitiesService.findAsGeoJson();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.facilitiesService.search(q);
  }

  @Get('nearby')
  nearby(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      throw new BadRequestException('Paramètres lat/lon invalides ou manquants');
    }
    return this.facilitiesService.nearby(
      latNum,
      lonNum,
      radiusKm ? parseFloat(radiusKm) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('dashboard')
  getDashboard() {
    return {
      message: 'Welcome to Admin Dashboard',
      facilities: this.facilitiesService.findAll(),
    };
  }


  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.facilitiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importGeoJson(@UploadedFile() file: Express.Multer.File) {
    return this.facilitiesService.importFromGeoJson(file);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put(':id')
  async updateFacility(@Param('id') id: number, @Body() body: any) {
    return this.facilitiesService.updateFacility(id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  async deleteFacility(@Param('id') id: number) {
    return this.facilitiesService.deleteFacility(id);
  }
}
