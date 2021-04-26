import {Entity, BaseEntity, PrimaryColumn} from "typeorm";


@Entity()
export class Group extends BaseEntity {
    @PrimaryColumn()
    id: number

    constructor(id: number) {
        super();
        this.id = id;
    }
}
