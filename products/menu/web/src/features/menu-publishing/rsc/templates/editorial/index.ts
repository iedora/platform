import type { MenuTemplate } from '../types'
import { EditorialMenu } from './editorial-menu'
import { meta } from './meta'

export const template: MenuTemplate = { ...meta, Component: EditorialMenu }
