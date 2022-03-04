# Base Image
FROM ubuntu:20.04

MAINTAINER VDJServer <vdjserver@utsouthwestern.edu>

# Install OS Dependencies
RUN export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y --fix-missing \
    make \
    gcc g++ \
    supervisor \
    wget \
    xz-utils \
    git \
    redis-server \
    redis-tools

# setup vdj user
RUN echo "vdj:x:816290:803419:VDJServer,,,:/home/vdj:/bin/bash" >> /etc/passwd
RUN echo "G-803419:x:803419:vdj" >> /etc/group
RUN mkdir /home/vdj
RUN chown vdj /home/vdj
RUN chgrp G-803419 /home/vdj

# node
ENV NODE_VER v12.18.3
RUN wget https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz
RUN tar xf node-$NODE_VER-linux-x64.tar.xz
RUN cp -rf /node-$NODE_VER-linux-x64/bin/* /usr/bin
RUN cp -rf /node-$NODE_VER-linux-x64/lib/* /usr/lib
RUN cp -rf /node-$NODE_VER-linux-x64/include/* /usr/include
RUN cp -rf /node-$NODE_VER-linux-x64/share/* /usr/share

# Copy project source
RUN mkdir /stats-api-js-tapis
COPY . /stats-api-js-tapis

# Install npm dependencies (optimized for cache)
COPY package.json /stats-api-js-tapis
RUN cd /stats-api-js-tapis && npm install

# Setup redis
COPY docker/redis/redis.conf /etc/redis/redis.conf

# Setup supervisor
COPY docker/supervisor/supervisor.conf /etc/supervisor/conf.d/

# ESLint
RUN cd /stats-api-js-tapis && npm run eslint app
RUN cd /stats-api-js-tapis && npm run eslint vdj-tapis-js

# Install the local airr-standards
#RUN cd /api-js-tapis/airr-standards/lang/python && python3 setup.py install

# Copy AIRR spec
#RUN cp /api-js-tapis/airr-standards/specs/adc-api-openapi3.yaml /api-js-tapis/app/api/swagger/adc-api.yaml
#RUN cp /api-js-tapis/airr-standards/specs/adc-api-async.yaml /api-js-tapis/app/api/swagger/adc-api-async.yaml
#RUN cp /api-js-tapis/airr-standards/specs/airr-schema-openapi3.yaml /api-js-tapis/app/config/airr-schema.yaml

CMD ["bash", "/stats-api-js-tapis/docker/scripts/start-service.sh"]
