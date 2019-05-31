import tornado.web
from tornado.ioloop import IOLoop
from terminado import TermSocket, UniqueTermManager

if __name__ == '__main__':
    term_manager = UniqueTermManager(shell_command=['firejail', '--quiet', '--net=none', '--private', '--chroot=files/fire', '/usr/local/bin/devilish.out'])

    
    handlers = [
                (r"/websocket", TermSocket, {'term_manager': term_manager}),
                (r"/()", tornado.web.StaticFileHandler, {'path':'index.html'}),
                (r"/(.*)", tornado.web.StaticFileHandler, {'path':'.'}),
               ]
    app = tornado.web.Application(handlers)
    app.listen(8282)
    IOLoop.current().start()

