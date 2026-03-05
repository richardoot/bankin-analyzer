import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { PersonsService } from './persons.service'
import { CreatePersonDto, UpdatePersonDto, PersonResponseDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('persons')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all persons for the current user' })
  @ApiResponse({ status: 200, type: [PersonResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<PersonResponseDto[]> {
    const persons = await this.personsService.findAllByUser(user.id)
    return persons.map(person => ({
      id: person.id,
      name: person.name,
      email: person.email,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    }))
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a person by ID' })
  @ApiResponse({ status: 200, type: PersonResponseDto })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<PersonResponseDto> {
    const person = await this.personsService.findOne(id, user.id)
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new person' })
  @ApiResponse({ status: 201, type: PersonResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreatePersonDto
  ): Promise<PersonResponseDto> {
    const person = await this.personsService.create(user.id, dto)
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a person' })
  @ApiResponse({ status: 200, type: PersonResponseDto })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto
  ): Promise<PersonResponseDto> {
    const person = await this.personsService.update(id, user.id, dto)
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a person' })
  @ApiResponse({ status: 200 })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.personsService.delete(id, user.id)
  }
}
