from settings import *
import pygame as pg

class Drawable:

    def __init__(self, width, height, x, y, color=(0, 0, 0)):
        self.width = width
        self.height = height
        self.color = color
        self.surface = pg.Surface([width, height], pg.SRCALPHA, 32)
        self.surface = pg.Surface.convert_alpha(self.surface)
        # Integer coordinates: the browser build rejects fractional blit positions.
        self.rect = self.surface.get_rect(x=int(x), y=int(y))

    def draw_on(self, surface):
        # The wasm build wants a plain (x, y) tuple as the blit destination.
        surface.blit(self.surface, (self.rect.x, self.rect.y))
