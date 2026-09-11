import {
  Controller,
  Get,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { UsersService } from './users.service'
import { UserResponseDto } from './dto'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { User } from '../generated/prisma'

/**
 * The account routes — and only ever the caller's own account.
 *
 * There is deliberately no way to read another user from here. A `GET /users`
 * and a `GET /users/:id` used to sit in this file, guarded by authentication
 * and nothing else: any valid token listed every account's id, supabaseId and
 * email. Nothing ever called them — the frontend has only ever asked for
 * `/users/me` — so they exposed without serving, and they are gone.
 *
 * `DELETE /users/:id` stays because it checks ownership before acting, and an
 * older client may still call it.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: "Recupere l'utilisateur connecte" })
  @ApiResponse({
    status: 200,
    description: "L'utilisateur connecte",
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Non authentifie' })
  getMe(@CurrentUser() user: User): UserResponseDto {
    return user
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime son propre compte' })
  @ApiResponse({ status: 204, description: 'Le compte a ete supprime' })
  @ApiResponse({ status: 401, description: 'Non authentifie' })
  async deleteMe(@CurrentUser() user: User): Promise<void> {
    await this.usersService.delete(user.id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprime un utilisateur (son propre compte uniquement)',
  })
  @ApiParam({ name: 'id', description: "L'identifiant de l'utilisateur" })
  @ApiResponse({ status: 204, description: "L'utilisateur a ete supprime" })
  @ApiResponse({ status: 401, description: 'Non authentifie' })
  @ApiResponse({ status: 403, description: 'Non autorise' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouve' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: User
  ): Promise<void> {
    if (user.id !== id) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que votre propre compte'
      )
    }
    await this.usersService.delete(id)
  }
}
