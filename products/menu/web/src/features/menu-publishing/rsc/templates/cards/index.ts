import type { MenuTemplate } from '../types'
import { CardsMenu } from './cards-menu'
import { meta } from './meta'

export const template: MenuTemplate = { ...meta, Component: CardsMenu }
