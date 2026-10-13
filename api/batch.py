from http.server import BaseHTTPRequestHandler
from api.common import execute

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        execute(self, 'batch')
