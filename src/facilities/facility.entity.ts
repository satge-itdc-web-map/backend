import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  name!: string;

  @Column({ nullable: true })
  amenity!: string;

  @Column({ nullable: true })
  healthcare!: string;

  @Column({ name: 'operator_type', nullable: true })
  operatorType!: string;

  @Column({ name: 'adm1_name', nullable: true })
  adm1Name!: string;

  @Column({ name: 'adm2_name', nullable: true })
  adm2Name!: string;

  @Column({ name: 'adm3_name', nullable: true })
  adm3Name!: string;

  @Column({ name: 'opening_time', nullable: true, default: '08:00' })
  openingTime!: string;

  @Column({ name: 'closing_time', nullable: true, default: '17:00' })
  closingTime!: string;

  @Column({ name: 'opening_days', nullable: true, default: 'Lundi - Vendredi' })
  openingDays!: string;

  @Column({ name: 'is_24h', default: false })
  is24h!: boolean;

  @Column({ nullable: true })
  phone!: string;

  @Column({ nullable: true })
  services!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl!: string;

  @Index({ spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  geom!: object;
}