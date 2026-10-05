// import { UserRole } from './user.entity';

// export class RegisterDto {
//   email: string;
//   password: string;
//   role: UserRole;
// }

// export class LoginDto {
//   email: string;
//   password: string;
// }

import { UserRole } from './user.entity';

export class RegisterDto {
  email: string;
  password: string;
  role: UserRole;
  username?: string;
}

export class LoginDto {
  email: string;
  password: string;
}