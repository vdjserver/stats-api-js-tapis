# Base Image
FROM ubuntu:18.04

MAINTAINER VDJServer <vdjserver@utsouthwestern.edu>

# Install OS Dependencies
RUN DEBIAN_FRONTEND='noninteractive' apt-get update
RUN DEBIAN_FRONTEND='noninteractive' apt-get install -y \
    make \
    gcc g++ \
    supervisor \
    wget \
    xz-utils

# node
RUN wget https://nodejs.org/dist/v8.10.0/node-v8.10.0-linux-x64.tar.xz
RUN tar xf node-v8.10.0-linux-x64.tar.xz
RUN cp -rf /node-v8.10.0-linux-x64/bin/* /usr/bin
RUN cp -rf /node-v8.10.0-linux-x64/lib/* /usr/lib
RUN cp -rf /node-v8.10.0-linux-x64/include/* /usr/include
RUN cp -rf /node-v8.10.0-linux-x64/share/* /usr/share

COPY docker/scripts/start-service.sh /root/start-service.sh

RUN mkdir /stats-api-js-tapis

# Setup supervisor
COPY docker/supervisor/supervisor.conf /etc/supervisor/conf.d/

# Install npm dependencies (optimized for cache)
COPY package.json /stats-api-js-tapis/
RUN cd /stats-api-js-tapis && npm install

# Copy project source
COPY . /stats-api-js-tapis

CMD ["/root/start-service.sh"]
