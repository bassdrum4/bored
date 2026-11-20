import asyncio
import sys
import traceback


def mark(step):
    """Set the page title so the browser shows how far startup got."""
    try:
        import platform

        platform.window.document.title = "amongus: " + step
    except Exception:
        pass


def report_error(text):
    try:
        import pygame

        text += "\n\n--- diagnostics ---"
        text += "\npygame file: %r" % (getattr(pygame, "__file__", None),)
        text += "\nhas image/mixer/font: %r" % (
            [hasattr(pygame, name) for name in ("image", "mixer", "font")],)
        text += "\nsys.path: %r" % (sys.path,)
    except Exception as exc:
        text += "\n(diagnostics failed: %r)" % (exc,)
    print(text, file=sys.stderr)
    try:
        import platform

        document = platform.window.document
        box = document.getElementById("pyerror")
        if box is None:
            box = document.createElement("pre")
            box.id = "pyerror"
            box.style.cssText = (
                "position:fixed;left:0;top:0;z-index:9999;background:#fff;color:#000;"
                "font:12px monospace;width:100%;max-height:100%;overflow:auto;"
                "white-space:pre-wrap;margin:0;padding:8px"
            )
            document.body.appendChild(box)
        box.textContent = text[:8000]
        document.title = "amongus: ERROR"
    except Exception:
        pass


mark("main.py running")

try:
    import pygame

    mark("pygame imported")
    pygame.init()
    mark("pygame initialized")
except BaseException:
    report_error(traceback.format_exc())
    raise

try:
    # Imported here so pygbag installs this pure-Python dependency before the
    # game modules are loaded.
    import pytmx  # noqa: F401
    from game import Game

    mark("game imported")
except BaseException:
    report_error(traceback.format_exc())
    raise


async def main():
    # One Game instance is reused between rounds: reloading every asset after
    # each round is prohibitively slow in the browser build.
    mark("constructing Game")
    try:
        game = Game()
    except BaseException:
        report_error(traceback.format_exc())
        raise
    mark("menu ready")
    while True:
        try:
            game.reset_round()
            mark("menu intro")
            await game.menu.game_intro()
        except BaseException:
            report_error(traceback.format_exc())
            raise
        await asyncio.sleep(0)


try:
    asyncio.run(main())
except BaseException:
    report_error(traceback.format_exc())
    raise
