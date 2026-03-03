import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto, UserResponseDto } from './dto'

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les utilisateurs' })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs',
    type: [UserResponseDto],
  })
  async findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recupere un utilisateur par son ID' })
  @ApiParam({ name: 'id', description: "L'identifiant de l'utilisateur" })
  @ApiResponse({
    status: 200,
    description: "L'utilisateur trouve",
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouve' })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Cree un nouvel utilisateur' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: "L'utilisateur a ete cree",
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Donnees invalides' })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime un utilisateur' })
  @ApiParam({ name: 'id', description: "L'identifiant de l'utilisateur" })
  @ApiResponse({ status: 204, description: "L'utilisateur a ete supprime" })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouve' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.usersService.delete(id)
  }
}
