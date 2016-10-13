import * as events from 'events';
import * as dgram from 'dgram';
import * as _ from 'lodash';

import { NetworkInterfaces } from './network-interfaces/NetworkInterfaces';
import { MSearchSocket } from './ssdp/MSearchSocket';
import { NotifySocket } from './ssdp/NotifySocket';
import { RootDescriptionRequest } from './ssdp/RootDescriptionRequest';
import { SsdpMessage } from './ssdp/SsdpMessage';
import { SsdpSocket } from './ssdp/SsdpSocket';
import { DeviceMapper } from './DeviceMapper';

export class SsdpDiscovery extends events.EventEmitter {

    private readonly sockets = new Array<SsdpSocket>();
    private readonly networkInterfaces = new NetworkInterfaces();
    private readonly deviceMapper = new DeviceMapper();

    /**
     * Start listen for SSDP advertisements on all network interface addresses.
     */
    start() {
        const addresses = this.networkInterfaces.getIPv4Addresses();

        // Start passive SSDP
        this.startSocket(new NotifySocket(addresses));

        // Start active SSDP
        _.forEach(addresses, address => this.startSocket(new MSearchSocket(address)));
    }

    /**
     * Starts a search by using HTTP method M-SEARCH.
     */
    search() {
        _.chain(this.sockets)
            .filter(socket => socket instanceof MSearchSocket)
            .map(socket => <MSearchSocket>socket)
            .forEach(socket => socket.search());
    }

    private startSocket(socket: SsdpSocket) {
        this.sockets.push(socket);
        socket.on('hello', (ssdpMessage: SsdpMessage) => this.onHello(ssdpMessage));
        socket.on('goodbye', (ssdpMessage: SsdpMessage) => this.onGoodbye(ssdpMessage));
        socket.start();
    }

    private onHello(ssdpMessage: SsdpMessage) {
        // Emit initial hello
        this.emit('hello', this.deviceMapper.fromSsdpMessage(ssdpMessage));

        // Request root description
        this.requestRootDescriptionAsync(ssdpMessage.remote, ssdpMessage.location);
    }

    private onGoodbye(ssdpMessage: SsdpMessage) {
        this.emit('goodbye', this.deviceMapper.fromSsdpMessage(ssdpMessage));
    }

    private async requestRootDescriptionAsync(remote: dgram.AddressInfo, location: string): Promise<void> {
        const request = new RootDescriptionRequest(remote, location);
        const rootDescription = await request.sendAsync();

        if (rootDescription !== null) {
            const device = await this.deviceMapper.fromRootDescriptionAsync(rootDescription);
            this.emit('hello', device);
        }
    }
}
