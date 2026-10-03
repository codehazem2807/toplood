import http.server
import socketserver
port = 8282
ip='192.168.1.8'
Handler = http.server.SimpleHTTPRequestHandler
server = socketserver.TCPServer((ip , port),Handler)
def run():
    print('serving at port ' , port )
    server.serve_forever()
run()
